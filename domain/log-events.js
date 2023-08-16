const {LOGIN, LOGOUT, PROFILE_UPDATE, CREATE_ACCESS_TOKEN, CREATE_APPLICATION, UPDATE_APPLICATION_STATE, CREATE_BATCH,
    UPDATE_BATCH, REGISTRATION
} = require("../constants/event-constants");

const moment = require("moment");
const {v4} = require("uuid");
const {NOT_APPLICABLE} = require("../constants/user-constants");
class AbstractLog {
    constructor() {
        this._id= v4();
        this.timestamp = Date.now();
        const unixToSecond = Math.floor(this.timestamp/1000);
        this.localtime = moment.unix(unixToSecond).format('YYYY-MM-DDTHH:mm:ss');
    }

    setUser(id, email, idp) {
        this.userID = id;
        this.userEmail = email;
        this.userIDP = idp;
    }

    setEventType(eventType) {
        this.eventType = eventType;
    }
}

const LoginEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(LOGIN);
    }
    static create(userID, userEmail, userIDP) {
        return new LoginEvent(userID, userEmail, userIDP);
    }
}

const LogoutEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(LOGOUT);
    }
    static create(userID, userEmail, userIDP) {
        return new LogoutEvent(userID, userEmail, userIDP);
    }
}

const RegistrationEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(REGISTRATION);
    }
    static create(userID, userEmail, userIDP) {
        return new RegistrationEvent(userID, userEmail, userIDP);
    }
}

const UpdateProfileEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP,prevProfile, newProfile) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(PROFILE_UPDATE);
        this.prevProfile = prevProfile;
        this.newProfile = newProfile;
    }
    static create(userID, userEmail, userIDP,prevProfile, newProfile) {
        return new UpdateProfileEvent(userID, userEmail, userIDP,prevProfile, newProfile);
    }
}

const CreateTokenEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(CREATE_ACCESS_TOKEN);
    }
    static create(userID, userEmail, userIDP) {
        return new CreateTokenEvent(userID, userEmail, userIDP);
    }
}

const CreateApplicationEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP, applicationID) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(CREATE_APPLICATION);
        this.applicationID = applicationID;
    }
    static create(userID, userEmail, userIDP, applicationID) {
        return new CreateApplicationEvent(userID, userEmail, userIDP, applicationID);
    }
}

const UpdateApplicationStateEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP, applicationID, prevState, newState) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(UPDATE_APPLICATION_STATE);
        this.applicationID = applicationID;
        this.prevState = prevState;
        this.newState = newState;
    }
    static create(userID, userEmail, userIDP, applicationID, prevState, newState) {
        return new UpdateApplicationStateEvent(userID, userEmail, userIDP, applicationID, prevState, newState);
    }
    static createByApp(applicationID, prevState, newState) {
        return new UpdateApplicationStateEvent(NOT_APPLICABLE, NOT_APPLICABLE, NOT_APPLICABLE, applicationID, prevState, newState);
    }
}

const CreateBatchEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(CREATE_BATCH);
    }
    static create(userID, userEmail, userIDP) {
        return new CreateBatchEvent(userID, userEmail, userIDP);
    }
}

const UpdateBatchEvent = class extends AbstractLog {
    constructor(userID, userEmail, userIDP) {
        super();
        this.setUser(userID, userEmail, userIDP);
        this.setEventType(UPDATE_BATCH);
    }
    static create(userID, userEmail, userIDP, prevState, newState) {
        return new UpdateBatchEvent(userID, userEmail, userIDP, prevState, newState);
    }
}

module.exports = {
    LoginEvent,
    LogoutEvent,
    RegistrationEvent,
    UpdateProfileEvent,
    CreateTokenEvent,
    CreateApplicationEvent,
    UpdateApplicationStateEvent,
    CreateBatchEvent,
    UpdateBatchEvent
}