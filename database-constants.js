module.exports = Object.freeze({
    // MongoDB Collections
    DATABASE_NAME: process.env.DATABASE_NAME || 'crdc-datahub',
    SESSION_COLLECTION: 'sessions',
    APPLICATION_COLLECTION: 'applications',
    SUBMISSIONS_COLLECTION: 'submissions',
    APPROVED_STUDIES_COLLECTION: 'approvedStudies',
    USER_COLLECTION: 'users',
    ORGANIZATION_COLLECTION: 'organization',
    BATCH_COLLECTION: 'batch',
    LOG_COLLECTION: 'logs',
    DATA_RECORDS_COLLECTION: 'dataRecords',
    INSTITUTION_COLLECTION: 'institutions'
});
