const {USER} = require("../constants/user-constants");
const {ERROR} = require("../constants/error-constants");
const {UpdateProfileEvent} = require("../domain/log-events");

const {getCurrentTime, subtractDaysFromNow, toISO} = require("../utility/time-utility");
const {LOGIN} = require("../constants/event-constants");
const {v4} = require("uuid");
const {createToken} = require("../services/tokenizer");


const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error(ERROR.NOT_LOGGED_IN);
}

const isValidUserStatus = (userStatus) => {
    const validUserStatus = [USER.STATUSES.ACTIVE];
    if (userStatus && !validUserStatus.includes(userStatus)) throw new Error(ERROR.INVALID_USER_STATUS);
}

class User {
    constructor(userCollection, logCollection, organizationService,config) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationService = organizationService;
        this.config = config;
    }

    // Note: This is a wrapper for the OrgService version which returns OrgInfo instead of Organization
    async listOrganizations(params, context) {
        isLoggedInOrThrow(context);
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        if (context.userInfo.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(ERROR.NO_ORG_ASSIGNED);
        }

        const filters = {};
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["_id"] = context?.userInfo?.organization?.orgID;
        }

        const data = await this.organizationService.listOrganizations(filters);
        return (data || []).map(org => ({
            orgID: org._id,
            orgName: org.name,
            createdAt: org.createdAt,
            updateAt: org.updateAt,
        }));
    }

    async getUserByID(userID) {
        const result = await this.userCollection.aggregate([{
            "$match": {
                _id: userID
            }
        }, {"$limit": 1}]);
        return (result?.length > 0) ? result[0] : null;
    }

    async getUser(params, context) {
        isLoggedInOrThrow(context);
        if (!params?.userID) {
            throw new Error(ERROR.INVALID_USERID);
        }
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(ERROR.NO_ORG_ASSIGNED);
        }
        const filters = { _id: params.userID };
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["organization.orgID"] = context?.userInfo?.organization?.orgID;
        }

        const result = await this.userCollection.aggregate([{
            "$match": filters
        }, {"$limit": 1}]);

        return (result?.length === 1) ? result[0] : null;
    }


    async listUsers(params, context) {
        isLoggedInOrThrow(context);
        if (context?.userInfo?.role !== USER.ROLES.ADMIN && context?.userInfo?.role !== USER.ROLES.ORG_OWNER) {
            throw new Error(ERROR.INVALID_ROLE);
        };
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER && !context?.userInfo?.organization?.orgID) {
            throw new Error(ERROR.NO_ORG_ASSIGNED);
        }

        const filters = {};
        if (context?.userInfo?.role === USER.ROLES.ORG_OWNER) {
            filters["organization.orgID"] = context?.userInfo?.organization?.orgID;
        }

        const result = await this.userCollection.aggregate([{
            "$match": filters
        }]);

        return result || [];
    }

    async getAdmin() {
        let result = await this.userCollection.aggregate([{
            "$match": {
                role: "Admin"
            }
        }]);
        return result;

    }

    async createNewUser(context) {
        let sessionCurrentTime = getCurrentTime();
        let email = context.userInfo.email;
        let emailName = email.split("@")[0];
        const newUser = {
            _id: v4(),
            email: email,
            IDP: context.userInfo.IDP,
            userStatus: USER.STATUSES.ACTIVE,
            role: USER.ROLES.USER,
            organization: {},
            firstName: context?.userInfo?.firstName || emailName,
            lastName: context.userInfo.lastName,
            createdAt: sessionCurrentTime,
            updateAt: sessionCurrentTime
        };
        const result = await this.userCollection.insert(newUser);
        if (!result?.acknowledged){
            let error = "An error occurred while creating a new user";
            console.error(error)
            throw new Error(error)
        }
        return newUser;
    }

    async getMyUser(params, context) {
        isLoggedInOrThrow(context);
        let result = await this.userCollection.aggregate([
            {
                "$match": {
                    email: context.userInfo.email,
                    IDP: context.userInfo.IDP,
                }
            },
            {"$sort": {createdAt: -1}}, // sort descending
            {"$limit": 1} // return one
        ]);
        if (!result){
            let error = "there is an error getting the result";
            console.error(error)
            throw new Error(error)
        }
        let user =  result[0];
        if (!user){
            user = await this.createNewUser(context);
        }
        context.userInfo = {
            ...context.userInfo,
            ...user
        }
        return context.userInfo;
    }

    async updateMyUser(params, context) {
        isLoggedInOrThrow(context);
        isValidUserStatus(context?.userInfo?.userStatus);
        let sessionCurrentTime = getCurrentTime();
        let user = await this.userCollection.find(context.userInfo._id);
        if (!user || !Array.isArray(user) || user.length < 1) throw new Error("User is not in the database")

        if (!context.userInfo._id) {
            let error = "there is no UserId in the session";
            console.error(error)
            throw new Error(error)
        }
        const updateUser ={
            _id: context.userInfo._id,
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: sessionCurrentTime
        }
        const updateResult = await this.userCollection.update(updateUser);
        // store user update log
        if (updateResult?.matchedCount > 0) {
            const prevUser = {firstName: user[0].firstName, lastName: user[0].lastName};
            const newProfile = {firstName: params.userInfo.firstName, lastName: params.userInfo.lastName};
            const log = UpdateProfileEvent.create(user[0]._id, user[0].email, user[0].IDP, prevUser, newProfile);
            await this.logCollection.insert(log);
        }
        // error handling
        if (updateResult.matchedCount < 1) {
            let error = "there is an error getting the result";
            console.error(error)
            throw new Error(error)
        }

        context.userInfo = {
            ...context.userInfo,
            ...updateUser,
            updateAt: sessionCurrentTime
        }
        const result = {
            ...user[0],
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: sessionCurrentTime
        }
        return result;
    }

    async editUser(params, context) {
        isLoggedInOrThrow(context);
        if (context?.userInfo?.role !== USER.ROLES.ADMIN) {
            throw new Error(ERROR.INVALID_ROLE);
        }
        if (!params.userID) {
            throw new Error(ERROR.INVALID_USERID);
        }

        const sessionCurrentTime = getCurrentTime();
        const user = await this.userCollection.aggregate([{ "$match": { _id: params.userID } }]);
        if (!user || !Array.isArray(user) || user.length < 1 || user[0]?._id !== params.userID) {
            throw new Error(ERROR.USER_NOT_FOUND);
        }

        const updatedUser = { _id: params.userID, updateAt: sessionCurrentTime };
        if (!params.organization && [USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER].includes(params.role)) {
            throw new Error(ERROR.USER_ORG_REQUIRED);
        }
        if (params.organization && params.organization !== user[0]?.organization?.orgID) {
            const newOrg = await this.organizationService.getOrganizationByID(params.organization);
            if (!newOrg?._id || newOrg?._id !== params.organization) {
                throw new Error(ERROR.INVALID_ORG_ID);
            }

            updatedUser.organization = {
                orgID: newOrg._id,
                orgName: newOrg.name,
                createdAt: newOrg.createdAt,
                updateAt: newOrg.updateAt,
            };
        } else if (!params.organization && user[0]?.organization?.orgID) {
            updatedUser.organization = null;
        }
        if (params.role && Object.values(USER.ROLES).includes(params.role)) {
            updatedUser.role = params.role;
        }
        if (params.status && Object.values(USER.STATUSES).includes(params.status)) {
            updatedUser.userStatus = params.status;
        }

        const updateResult = await this.userCollection.update(updatedUser);
        if (updateResult?.matchedCount === 1) {
            const prevProfile = {}, newProfile = {};

            Object.keys(updatedUser).forEach(key => {
                if (["_id", "updateAt"].includes(key)) {
                    return;
                }

                prevProfile[key] = user[0]?.[key];
                newProfile[key] = updatedUser[key];
            });

            const log = UpdateProfileEvent.create(user[0]._id, user[0].email, user[0].IDP, prevProfile, newProfile);
            await this.logCollection.insert(log);
        } else {
            throw new Error(ERROR.UPDATE_FAILED);
        }

        return { ...user[0], ...updatedUser };
    }

    async getAdminUserEmails() {
        const orgOwnerOrAdminRole = {
            "userStatus": USER.STATUSES.ACTIVE,
            "$or": [{"role": USER.ROLES.ADMIN}, {"role": USER.ROLES.ORG_OWNER}]
        };
        return await this.userCollection.aggregate([{"$match": orgOwnerOrAdminRole}]) || [];
    }

    async getInactiveUsers(inactiveDays) {
        const query = [
            {"$match": {
                eventType: LOGIN
            }},
            {"$group": {_id: { userEmail: "$userEmail", userIDP: "$userIDP" }, lastLogin: { $max: "$localtime" }}},
            {"$match": { // inactive conditions
                lastLogin: {
                    $lt: subtractDaysFromNow(inactiveDays)
                }
            }},
            {"$project": {
                _id: 0, // Exclude _id field
                email: "$_id.userEmail",
                IDP: "$_id.userIDP"
            }}
        ];
        return await this.logCollection.aggregate(query) || [];
    }
    /**
     * Finds all users.
     *
     * @returns {Promise<Array>} - An array of log aggregation result projecting email and idp only.
     */
    async getAllUsersByEmailAndIDP() {
        return await this.logCollection.aggregate([
            {"$match": {
                    eventType: LOGIN
            }},
            {"$group": {_id: { userEmail: "$userEmail", userIDP: "$userIDP" }}},
            {"$project": {
                _id: 0,
                email: "$_id.userEmail",
                IDP: "$_id.userIDP"
            }}
        ]);
    }
    /**
     * Finds users excluding specific user conditions.
     *
     * @param {Array} users - An array of user conditions for $nor.
     * @returns {Promise<Array>} - An array of user aggregation result projecting email and idp only.
     */
    async findUsersExcludingEmailAndIDP(users) {
        const condition = {"$match": {
            ...(users && users?.length > 0) ? {$nor: users} : {},
            // valid user-statuses
            userStatus: { $in: [USER.STATUSES.ACTIVE]
            }
        }}
        return await this.userCollection.aggregate([condition,{$project: { _id: 0, email: 1, IDP: 1 }}]);
    }
    /**
     * Disable users matching specific user conditions.
     *
     * @param {Array} users - An array of user conditions for $or.
     * @returns {Promise<Array>} - An array of user aggregation result.
     */
    // search by user's email and idp
    async disableInactiveUsers(inactiveUsers) {
        if (!inactiveUsers || inactiveUsers?.length === 0) return [];
        const query = {"$or": inactiveUsers};
        const updated = await this.userCollection.updateMany(query, {userStatus: USER.STATUSES.DISABLED});
        if (updated?.modifiedCount && updated?.modifiedCount > 0) {
            return await this.userCollection.aggregate([{"$match": query}]) || [];
        }
        return [];
    }
    /**
     * Check if login with an email and identity provider (IDP) is permitted.
     *
     * @param {string} email - The email address.
     * @param {string} idp - The identity provider.
     * @returns {boolean} True if login is permitted, false otherwise.
     * @throws {Error} Throws an error if there is an unexpected database issue.
     */
    async isEmailAndIDPLoginPermitted(email, idp) {
        const result = await this.userCollection.aggregate([
            {
                "$match": {
                    email: email,
                    IDP: idp,
                    userStatus:{
                        $ne: USER.STATUSES.ACTIVE
                    }
                }
            },
            {"$limit": 1} // return one
        ]);
        if (!result || !Array.isArray(result)){
            throw new Error("An database error occurred while querying login permission");
        }
        return result?.length === 0;
    }

    isAdmin(role) {
        return role && role === USER.ROLES.ADMIN;
    }
    /**
     * getOrgOwnerByOrgName
     * @param {*} orgName 
     * @returns user[]
     */
    async getOrgOwnerByOrgName(orgName) {

        const orgOwner= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.ORG_OWNER,
            "organization.orgName": orgName
        };
        return await this.userCollection.aggregate([{"$match": orgOwner}]) || [];
    }

    isValidOrThrow(conditions){
        conditions.forEach((condition) => {
            if (!condition) throw new Error("Both email and IDP are required!")
        });
    }

    epochLogTime() {
        const logTime = addSeconds(getTimeNow(), config.token_timeout).toString();
        return Date.parse(logTime);
    }

    async grantToken (_, context){
        const userInfo = context.userInfo;
        //console.debug(userInfo, "User Info");
        this.isValidOrThrow([userInfo.email, userInfo.IDP]);
        const uuid = v4();
        const accessToken = createToken({...userInfo, uuid}, this.config.token_secret, this.config.token_timeout);
        //console.debug(accessToken, "Token");
        return {
            tokens: [accessToken],
            message: 'This token can only be viewed once and will be lost if it is not saved by the user'
        }
    }
}

module.exports = {
    User
}