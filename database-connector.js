const MongoClient = require('mongodb').MongoClient;

class DatabaseConnector {
    constructor(connectionString) {
        this.connectionString = connectionString;
        this.client = null;
    }

    async connect() {
        try {
            this.client = new MongoClient(this.connectionString, { useNewUrlParser: true, useUnifiedTopology: true });
            const manager = new MongoDBClientWrapper(this.client);
            await manager.connect();
        } catch (err) {
            console.error('Error connecting to MongoDB:', err);
        }
        return this.client;
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.close();
                console.log('Disconnected from MongoDB');
            }
        } catch (err) {
            console.error('Error disconnecting from MongoDB:', err);
        }
    }
}


class MongoDBClientWrapper {
    #isMongoConnected = false;
    constructor(client) {
        this.client = client;

    }

    async connect() {
        try {
            await this.#connectWithRetry(this.client);
            this.#isMongoConnected = true;
        } catch (error) {
            console.warn("MongoDB connection failed.");
            this.#isMongoConnected = false;
        }
    }

    async #connectWithRetry(client, retries = 10, delay = 1000) {
        while (retries > 0) {
            try {
                await client.connect();
                console.log("MongoDB connection established successfully.");
                return; // Exit if connected successfully
            } catch (error) {
                retries -= 1;
                console.warn(`Failed to connect to MongoDB. Retries left: ${retries}`);
                console.error("MongoDB Connection Error:", error.message);

                if (retries === 0) {
                    console.error("All connection attempts failed. Service will continue without a database connection.");
                    client.isMongoConnected = false; // Fail gracefully after all retries
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

module.exports = {
    DatabaseConnector
};