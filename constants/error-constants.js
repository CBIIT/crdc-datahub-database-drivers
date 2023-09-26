module.exports = Object.freeze({
    ERROR: {
        // TODO CRDC backend already has these error constants, let's merge it.
        NOT_LOGGED_IN: "A user must be logged in to call this API",
        INACTIVE_USER: "Login Failed: This user account has been marked as inactive and must be reactivated before it can be used",
        INVALID_USER_STATUS: "This user account has does not have the correct status to perform this operation",
        INVALID_USERID: "A userID argument is required to call this API",
        INVALID_ROLE: "You do not have the correct role to perform this operation",
        NO_ORG_ASSIGNED: "You do not have an organization assigned to your account",
        USER_NOT_FOUND: "The user you are trying to update does not exist",
        UPDATE_FAILED: "Unknown error occurred while updating object",
        INVALID_ORG_ID: "The organization ID you provided is invalid",
        INVALID_ROLE_ASSIGNMENT: "The role you are trying to assign is invalid",
        USER_ORG_REQUIRED: "An organization is required for the role you are trying to assign",
        MONGODB_HEALTH_CHECK_FAILED: "The MongoDB health check failed, please see the logs for more information"
    },
});
