const {USER} = require("../constants/user-constants");
const {ERROR} = require("../constants/error-constants");
const {UpdateProfileEvent} = require("../domain/log-events");

const {getCurrentTime, subtractDaysFromNow} = require("../utility/time-utility");
const {LOGIN} = require("../constants/event-constants");
const {v4} = require("uuid");
const config = require("../../config")
const jwt = require("jsonwebtoken");



const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error(ERROR.NOT_LOGGED_IN);
}

const isValidUserStatus = (userStatus) => {
    const validUserStatus = [USER.STATUSES.ACTIVE];
    if (userStatus && !validUserStatus.includes(userStatus)) throw new Error(ERROR.INVALID_USER_STATUS);
}

const createToken = (userInfo, token_secret, tokenTimeout)=> {
    return jwt.sign(
        userInfo,
        token_secret,
        { expiresIn: tokenTimeout });
}

class User {
    constructor(userCollection, logCollection, organizationCollection, notificationsService, submissionsCollection, applicationCollection, officialEmail, devTier) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.notificationsService = notificationsService;
        this.submissionsCollection = submissionsCollection;
        this.applicationCollection = applicationCollection;
        this.officialEmail = officialEmail;
        this.devTier = devTier;
    }

    async grantToken(params, context){
        isLoggedInOrThrow(context);
        isValidUserStatus(context?.userInfo?.userStatus);
        if(context?.userInfo?.tokens){
            context.userInfo.tokens = []
        }
        const accessToken = createToken(context?.userInfo, config.token_secret, config.token_timeout);
        await this.linkTokentoUser(context, accessToken);
        return {
            tokens: [accessToken],
            message: "This token can only be viewed once and will be lost if it is not saved by the user"
        }
    }

    async linkTokentoUser(context, accessToken){
        const sessionCurrentTime = getCurrentTime();
        const updateUser ={
            _id: context.userInfo._id,
            tokens: [accessToken],
            updateAt: sessionCurrentTime
        }
        const updateResult = await this.userCollection.update(updateUser);

        if (!updateResult?.matchedCount === 1) {
            throw new Error(ERROR.UPDATE_FAILED);
        }

        context.userInfo = {
            ...context.userInfo,
            ...updateUser
        }
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

    /**
     * List Active Curators API Interface.
     *
     * - `ADMIN` can call this API only
     *
     * @api
     * @param {Object} params Endpoint parameters
     * @param {{ cookie: Object, userInfo: Object }} context API request context
     * @returns {Promise<Object[]>} An array of Curator Users mapped to the `UserInfo` type
     */
    async listActiveCuratorsAPI(params, context) {
        if (!context?.userInfo?.email || !context?.userInfo?.IDP) {
            throw new Error(ERROR.NOT_LOGGED_IN);
        }
        if (context?.userInfo?.role !== USER.ROLES.ADMIN) {
            throw new Error(ERROR.INVALID_ROLE);
        };

        const curators = await this.getActiveCurators();
        return curators?.map((user) => ({
            userID: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt,
            updateAt: user.updateAt,
        })) || [];
    }

    /**
     * Get all users with the `CURATOR` role and `ACTIVE` status.
     *
     * @async
     * @returns {Promise<Object[]>} An array of Users
     */
    async getActiveCurators() {
        const filters = { role: USER.ROLES.CURATOR, userStatus: USER.STATUSES.ACTIVE };
        const result = await this.userCollection.aggregate([{ "$match": filters }]);

        return result || [];
    }

    async getAdmin() {
        let result = await this.userCollection.aggregate([{
            "$match": {
                role: USER.ROLES.ADMIN,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
        return result || [];
    }

    async getPOCs() {
        let result = await this.userCollection.aggregate([{
            "$match": {
                role: USER.ROLES.DC_POC,
                userStatus: USER.STATUSES.ACTIVE
            }
        }]);
        return result || [];
    }

    async getConcierge(orgID) {
        let result = await this.userCollection.aggregate([{
            "$match": {
                "organization.orgID": orgID,
                role: USER.ROLES.CURATOR
            }
        }]);
        return result;
    }

    async getOrgOwner(orgID) {
        let result = await this.userCollection.aggregate([{
            "$match": {
                "organization.orgID": orgID,
                role: USER.ROLES.ORG_OWNER,
                userStatus: USER.STATUSES.ACTIVE
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
            dataCommons: [],
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

        // Update all dependent objects only if the User's Name has changed
        // NOTE: We're not waiting for these async updates to complete before returning the updated User
        if (updateUser.firstName !== user[0].firstName || updateUser.lastName !== user[0].lastName) {
            this.submissionsCollection.updateMany(
                { "submitterID": updateUser._id },
                { "submitterName": `${updateUser.firstName} ${updateUser.lastName}` }
            );
            this.organizationCollection.updateMany(
                { "conciergeID": updateUser._id },
                { "conciergeName": `${updateUser.firstName} ${updateUser.lastName}` }
            );
            this.applicationCollection.updateMany(
                { "applicant.applicantID": updateUser._id },
                { "applicant.applicantName": `${updateUser.firstName} ${updateUser.lastName}` }
            );
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
        if (typeof(params.organization) !== "undefined" && params.organization && params.organization !== user[0]?.organization?.orgID) {
            const result = await this.organizationCollection.aggregate([{
                "$match": { _id: params.organization }
            }, {"$limit": 1}]);
            const newOrg = result?.[0];

            if (!newOrg?._id || newOrg?._id !== params.organization) {
                throw new Error(ERROR.INVALID_ORG_ID);
            }

            updatedUser.organization = {
                orgID: newOrg._id,
                orgName: newOrg.name,
                createdAt: newOrg.createdAt,
                updateAt: newOrg.updateAt,
            };
        } else if (typeof(params.organization) !== "undefined" && !params.organization && user[0]?.organization?.orgID) {
            updatedUser.organization = null;
        }
        if (params.role && Object.values(USER.ROLES).includes(params.role)) {
            updatedUser.role = params.role;
        }
        if (params.status && Object.values(USER.STATUSES).includes(params.status)) {
            updatedUser.userStatus = params.status;
        }

        const dataCommonsProvided = typeof params.dataCommons !== "undefined";
        const userIsDcPOC = updatedUser.role === USER.ROLES.DC_POC || (typeof(updatedUser.role) === "undefined" && user[0]?.role === USER.ROLES.DC_POC);
        if (userIsDcPOC && dataCommonsProvided && params.dataCommons?.length > 0) {
            updatedUser.dataCommons = params.dataCommons;
        } else if (userIsDcPOC && dataCommonsProvided && !params.dataCommons?.length) {
            throw new Error(ERROR.USER_DC_REQUIRED);
        } else if (!userIsDcPOC && user[0]?.dataCommons?.length > 0) {
            updatedUser.dataCommons = [];
        }

        // Check if Data Commons is required and missing for the user's role
        const userDataCommons = updatedUser.dataCommons?.length > 0 || (user[0]?.dataCommons?.length > 0 && !dataCommonsProvided);
        if (userIsDcPOC && !userDataCommons) {
            throw new Error(ERROR.USER_DC_REQUIRED);
        }

        // Check if an organization is required and missing for the user's role
        const userHasOrg = !!updatedUser?.organization?.orgID || (user[0]?.organization?.orgID && typeof(updatedUser.organization) === "undefined");
        if (!userHasOrg && [USER.ROLES.DC_POC, USER.ROLES.ORG_OWNER, USER.ROLES.SUBMITTER].includes(updatedUser.role || user[0]?.role)) {
            throw new Error(ERROR.USER_ORG_REQUIRED);
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

            const aUser = user[0];
            const isUserActivated = aUser?.userStatus !== USER.STATUSES.INACTIVE;
            const isStatusChange = params.status && params.status.toLowerCase() === USER.STATUSES.INACTIVE.toLowerCase();
            if (isUserActivated && isStatusChange) {
                const adminEmails = await this.getAdminUserEmails();
                const CCs = adminEmails.filter((u)=> u.email).map((u)=> u.email);
                await this.notificationsService.inactiveUserNotification(aUser.email,
                    CCs, {firstName: aUser.firstName},
                    {officialEmail: this.officialEmail}
                ,this.devTier);
            }

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
        const updated = await this.userCollection.updateMany(query, {userStatus: USER.STATUSES.INACTIVE});
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

    /**
     * getOrgOwnerByOrgName
     * @param {*} orgName
     * @returns {Promise<Array>} user[]
     */
    async getOrgOwnerByOrgName(orgName) {
        const orgOwner= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.ORG_OWNER,
            "organization.orgName": orgName
        };
        return await this.userCollection.aggregate([{"$match": orgOwner}]);
    }

    isAdmin(role) {
        return role && role === USER.ROLES.ADMIN;
    }
}

module.exports = {
    User
}
