const {getCurrentTimeYYYYMMDDSS} = require("../utility/time-utility");
const {v4} = require("uuid")
const {USER} = require("../constants/user-constants");

class User {
    constructor(userCollection) {
        this.userCollection = userCollection
    }

    async getUser(userID) {
        let result = await this.userCollection.aggregate([{
            "$match": {
                _id: userID
            }
        }, {"$limit": 1}]);
        return (result?.length > 0) ? result[0] : null;
    }

    async getMyUser(params, context) {
        if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error("A user must be logged in to call this API");
        let session_currentTime = getCurrentTimeYYYYMMDDSS();
        const user_email = {
            "$match": {
                email: context.userInfo.email,
                IDP: context.userInfo.IDP,
            }
        }
        const sortCreatedAtDescending = {"$sort": {createdAt: -1}};
        const limitReturnToOneApplication = {"$limit": 1};
        const pipeline = [
            user_email,
            sortCreatedAtDescending,
            limitReturnToOneApplication
        ];
        let result = await this.userCollection.aggregate(pipeline);
        let user
        if (result.length < 1) {
            let email = context.userInfo.email;
            let emailName = email.split("@")[0];
            let firstName = context?.userInfo?.firstName || emailName;
            user = {
                _id: v4(),
                email: email,
                IDP: context.userInfo.IDP,
                userStatus: USER.STATUSES.ACTIVE,
                role: USER.ROLES.USER,
                organization: {},
                firstName: firstName,
                lastName: context.userInfo.lastName,
                createdAt: session_currentTime,
                updateAt: session_currentTime
            }
            await this.userCollection.insert(user);
        } else {
            user = result[0];
        }
        if (result.matchedCount < 1) {
            let error = "there is an error getting the result";
            console.error(error)
            throw new Error(error)
        }
        context.userInfo = {
            ...user,
            ...context.userInfo
        }
        return user
    }

    async updateMyUser(params, context) {
        
        if (!context?.userInfo?.email || !context?.userInfo?.IDP) throw new Error("A user must be logged in to call this API");
        let session_currentTime = getCurrentTimeYYYYMMDDSS();
        let user = await this.userCollection.find(context.userInfo._id);
        if (!user || !Array.isArray(user) || user.length < 1) 
            throw new Error("User is not in the database")
        let update_result 

        // verifried
        if (!context.userInfo._id) {
            let error = "there is no UserId in the session";
            console.error(error)
            throw new Error(error)
        }


        const target_obj ={
            _id: context.userInfo._id,
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: session_currentTime
        }

        update_result = await this.userCollection.update(target_obj);

        // error handling
        if (update_result.matchedCount < 1) {
            let error = "there is an error getting the result";
            console.error(error)
            throw new Error(error)
        }
        

        context.userInfo = {
            ...context.userInfo,
            ...target_obj,
            updateAt: session_currentTime

        }
        user = {
            ...user[0],
            firstName: params.userInfo.firstName,
            lastName: params.userInfo.lastName,
            updateAt: session_currentTime
        }

        return user

    }

    isAdmin(role) {
        return role && role === USER.ROLES.ADMIN;
    }
}


module.exports = {
    User
}
