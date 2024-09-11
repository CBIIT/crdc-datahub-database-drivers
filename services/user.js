const {USER} = require("../constants/user-constants");
const {ERROR} = require("../constants/error-constants");
const {UpdateProfileEvent, ReactivateUserEvent} = require("../domain/log-events");

const {includesAll} = require("../utility/string-utility")
const {getCurrentTime, subtractDaysFromNowTimestamp} = require("../utility/time-utility");
const config = require("../../config")
const jwt = require("jsonwebtoken");
const {LOG_COLLECTION} = require("../database-constants");
const orgToUserOrg = require("../utility/org-to-userOrg-converter");



const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error(ERROR.NOT_LOGGED_IN);
}

const isValidUserStatus = (userStatus) => {
    const validUserStatus = [USER.STATUSES.ACTIVE];
    if (userStatus && !validUserStatus.includes(userStatus)) throw new Error(ERROR.INVALID_USER_STATUS);
}

const createToken = (userInfo, token_secret, token_timeout)=> {
    return jwt.sign(
        userInfo,
        token_secret,
        { expiresIn: token_timeout });
}



class User {
    constructor(userCollection, logCollection, organizationCollection, notificationsService, submissionsCollection, applicationCollection, officialEmail, tier) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
        this.organizationCollection = organizationCollection;
        this.notificationsService = notificationsService;
        this.submissionsCollection = submissionsCollection;
        this.applicationCollection = applicationCollection;
        this.officialEmail = officialEmail;
        this.tier = tier;
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
        }
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
        }

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
        if (![USER.ROLES.ADMIN, USER.ROLES.FEDERAL_MONITOR].includes(context?.userInfo?.role)) {
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

            updatedUser.organization = orgToUserOrg(newOrg);
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

        // add studies to user.
        let user_org = updatedUser.organization ;
        if (params.studies &&  params.studies.length > 0) {
            if (!user_org) {
               const result = await this.organizationCollection.aggregate([{
                    "$match": { _id: params.organization }
                    }, {"$limit": 1}]);
                if (!result?.[0]?._id) {
                    throw new Error(ERROR.INVALID_ORG_ID);
                }
                user_org = result[0];
            }
            const approvedStudies = user_org?.studies;
            if (!approvedStudies || approvedStudies.length === 0) {
                throw new Error(ERROR.INVALID_NO_STUDIES);
            }


            const approvedStudyArr = approvedStudies.map((study) => study._id)
            if (!includesAll(approvedStudyArr, params.studies)) {
                throw new Error(ERROR.INVALID_NOT_APPROVED_STUDIES);
            }
            updatedUser.studies = params?.studies;
        }
        if (params?.status){
            if (! [USER.STATUSES.ACTIVE, USER.STATUSES.INACTIVE].includes(params.status))
                throw new Error(ERROR.INVALID_USER_STATUS);

            updatedUser.status = params.status
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
                await this.notificationsService.deactivateUserNotification(aUser.email,
                    CCs, {firstName: aUser.firstName},
                    {officialEmail: this.officialEmail}
                ,this.tier);
            }

            // create an array to store new events
            let logEvents = [];
            // create an profile update event and store it in the events array
            const updateProfileEvent = UpdateProfileEvent.create(user[0]._id, user[0].email, user[0].IDP, prevProfile, newProfile);
            logEvents.push(updateProfileEvent);
            // if the user has been reactivated during the update
            if (prevProfile?.userStatus === USER.STATUSES.INACTIVE && newProfile?.userStatus === USER.STATUSES.ACTIVE){
                // create Reactivate User event and add it to the events array
                const reactivateUserEvent = ReactivateUserEvent.create(user[0]._id, user[0].email, user[0].IDP);
                logEvents.push(reactivateUserEvent);
            }
            // insert all of the events in the events array into the log collection
            await this.logCollection.insertMany(logEvents);
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

    /**
     * Disable users matching specific user conditions.
     *
     * @param {Array} inactiveUsers - An array of user conditions for $or.
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

    /**
     * getFederalMonitors
     * @returns {Promise<Array>} user[]
     */
    async getFederalMonitors(studyID) {
        const query= {
            "userStatus": USER.STATUSES.ACTIVE,
            "role": USER.ROLES.FEDERAL_MONITOR,
            "studies": {$in: studyID}
        };
        return await this.userCollection.aggregate([{"$match": query}]);
    }

    isAdmin(role) {
        return role && role === USER.ROLES.ADMIN;
    }

    async checkForInactiveUsers(qualifyingEvents) {
        // users collection field names
        const USER_FIELDS = {
            ID: "_id",
            FIRST_NAME: "firstName",
            EMAIL: "email",
            IDP: "IDP",
            STATUS: "userStatus"
        };
        // logs collection field names
        const LOGS_FIELDS = {
            EMAIL: "userEmail",
            IDP: "userIDP",
            EVENT_TYPE: "eventType",
            TIMESTAMP: "timestamp"
        };
        // fields added by pipeline
        const LOGS_ARRAY = "log_events_array";
        const LATEST_LOG = "latest_log_event";

        let pipeline = [];
        // filter out users where status is not "Active"
        pipeline.push({
            $match: {
                [USER_FIELDS.STATUS]: USER.STATUSES.ACTIVE
            }
        });
        // collect log events where the log event email matches the user's email and store the events in an array
        // NOTE: we can only match on one field here so log events where the IDP does not match will be filtered out in
        // the next stage
        pipeline.push({
            $lookup: {
                from: LOG_COLLECTION,
                localField: USER_FIELDS.EMAIL,
                foreignField: LOGS_FIELDS.EMAIL,
                as: LOGS_ARRAY
            }
        });
        // filter out the log events where the IDP does not match the user's IDP and the log events where the event type
        // is not included in the qualifying events array
        pipeline.push({
            $set: {
                [LOGS_ARRAY]: {
                    $filter: {
                        input: "$" + LOGS_ARRAY,
                        as: "log",
                        cond: {
                            $and: [
                                {
                                    $eq: ["$$log." + LOGS_FIELDS.IDP, "$" + USER_FIELDS.IDP],
                                },
                                {
                                    $in: ["$$log." + LOGS_FIELDS.EVENT_TYPE, qualifyingEvents]
                                },
                            ],
                        }
                    }
                }
            }
        });
        // store the most recent log event in a new field
        pipeline.push({
            $set: {
                [LATEST_LOG]: {
                    $first: {
                        $sortArray: {
                            input: "$" + LOGS_ARRAY,
                            sortBy: {
                                timestamp: -1
                            }
                        }
                    }
                }
            }
        });
        // filter out users that have qualifying log event types recent enough to fall within the inactive user days period
        pipeline.push({
            $match: {
                $or: [
                    {
                        [LATEST_LOG+"."+LOGS_FIELDS.TIMESTAMP]: {
                            $exists: 0
                        }
                    },
                    {
                        [LATEST_LOG+"."+LOGS_FIELDS.TIMESTAMP]: {
                            $lt: subtractDaysFromNowTimestamp(config.inactive_user_days)
                        }
                    },
                ]
            }
        });
        // format the output
        pipeline.push({
            $project: {
                [USER_FIELDS.ID]: 1,
                [USER_FIELDS.EMAIL]: 1,
                [USER_FIELDS.IDP]: 1,
                [USER_FIELDS.FIRST_NAME]: 1,
            }
        });
        return await this.userCollection.aggregate(pipeline);
    }
}

module.exports = {
    User
}
