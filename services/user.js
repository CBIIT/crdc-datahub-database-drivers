const {getCurrentTimeYYYYMMDDSS} = require("../utility/time-utility");
const {v4} = require("uuid")
const {USER} = require("../constants/user-constants");
const {UpdateProfileEvent} = require("../domain/log-events");

const isLoggedInOrThrow = (context) => {
    if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error("A user must be logged in to call this API");
}

class User {
    constructor(userCollection, logCollection) {
        this.userCollection = userCollection;
        this.logCollection = logCollection;
    }

    async getUser(userID) {
        let result = await this.userCollection.aggregate([{
            "$match": {
                _id: userID
            }
        }, {"$limit": 1}]);
        return (result?.length > 0) ? result[0] : null;
    }

    async createNewUser(context) {
        let sessionCurrentTime = getCurrentTimeYYYYMMDDSS();
        let email = context.userInfo.email;
        let emailName = email.split("@")[0];
        const aUser = {
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
        await this.userCollection.insert(aUser);
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
        const isUserExits = result.length < 1;
        const aUser = isUserExits ? await this.createNewUser(context) : result[0];

        if (result.matchedCount < 1) {
            let error = "there is an error getting the result";
            console.error(error)
            throw new Error(error)
        }

        context.userInfo = {
            ...context.userInfo,
            ...aUser,
        }
        return aUser
    }

    async updateMyUser(params, context) {
        isLoggedInOrThrow(context);
        let sessionCurrentTime = getCurrentTimeYYYYMMDDSS();
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
        return {
            ...user[0],
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: sessionCurrentTime
        }

    }

    async getAdminUserEmails() {
        const orgOwnerOrAdminRole = {
            "userStatus": USER.STATUSES.ACTIVE,
            "$or": [{"role": USER.ROLES.ADMIN}, {"role": USER.ROLES.ORG_OWNER}]
        };
        return await this.userCollection.aggregate([{"$match": orgOwnerOrAdminRole}]) || [];
    }

    isAdmin(role) {
        return role && role === USER.ROLES.ADMIN;
    }
}


module.exports = {
    User
}
