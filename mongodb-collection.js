const DATABASE_ERROR = new Error("Database operation failed, please see logs for more information");
class MongoDBCollection {

    constructor(client, databaseName, collectionName) {
        this.collection = client.db(databaseName).collection(collectionName);
    }

    async find(id){
        try{
            return await this.collection.find({_id: id}).toArray();
        }
        catch (e){
            logAndThrow("An exception occurred during a find operation", e);
        }
    }

    async aggregate(pipeline){
        try{
            return await this.collection.aggregate(pipeline).toArray()
        }
        catch (e){
            logAndThrow("An exception occurred during an aggregate operation", e);
        }
    }

    async insert(application){
        try{
            return await this.collection.insertOne(application);
        }
        catch (e){
            logAndThrow("An exception occurred during an insert operation", e);
        }
    }


    async findOneAndUpdate(query, doc) {
        const updateDoc = {
            $set: doc
        };
        try{
            return await this.collection.findOneAndUpdate(query, updateDoc, { upsert: true});
        }
        catch (e){
            logAndThrow("An exception occurred during an findOne and update operation", e);
        }
    }

    async update(application, option) {
        const filter = {
            _id: application._id
        };
        const updateDoc = {
            $set: application,
            ...option
        };
        try{
            return await this.collection.updateOne(filter, updateDoc);
        }
        catch (e){
            logAndThrow("An exception occurred during an update one operation", e);
        }
    }

    async updateMany(query, document, option) {
        const updateDoc = {
            $set: document,
            ...option
        };
        try{
            return await this.collection.updateMany(query, updateDoc);
        }
        catch (e){
            logAndThrow("An exception occurred during an updateMany operation", e);
        }
    }

    async deleteOneById(id) {
        return await this.deleteOne({_id: id});
    }

    async deleteOne(query) {
        try{
            return await this.collection.deleteOne(query);
        }
        catch (e){
            logAndThrow("An exception occurred during a delete operation", e);
        }
    }
}

function logAndThrow(message, error){
    console.error(message)
    console.error(error)
    throw DATABASE_ERROR;
}

module.exports = {
    MongoDBCollection
}
