const AWS = require('aws-sdk');
class S3Service {

    constructor() {
        this.s3 = new AWS.S3();
    }

    async createPreSignedURL(bucketName, prefix, fileName) {
        try {
            const params = {
                Bucket: bucketName,
                Key: `${prefix}/${fileName}`,
                Expires: 3600, // 1 hour
                ACL: 'private', // files to be publicly inaccessible
                ContentType: 'text/tab-separated-values',
                ContentDisposition: `attachment; filename="${fileName}"`,
            };
            return new Promise((resolve, reject) => {
                this.s3.getSignedUrl('putObject', params, (error, url) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(url);
                    }
                });
            });
        } catch (error) {
            console.error('Error generating pre-signed URL:', error);
        }
    }

    /**
     * Asynchronously deletes a file from an AWS S3 bucket.
     * @param {string} bucketName - The name of the S3 bucket from which the file will be deleted.
     * @param {string} fileKey - The key (path including the filename) of the file to delete.
     * @returns {Promise<Object>} A promise that resolves to the result of the delete operation if successful.
     */
    async deleteFile(bucketName, fileKey) {
        return new Promise((resolve, reject) => {
            try {
                this.s3.deleteObject({Bucket: bucketName, Key: fileKey}, (err, data)=> {
                    if (err) {
                        console.error(`Failed to delete file "${fileKey}" from bucket "${bucketName}": ${err.message}`);
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            } catch (err) {
                console.error(`Failed to delete file "${fileKey}" from bucket "${bucketName}": ${err.message}`);
                reject(err);
            }
        });
    }

    /**
     * Asynchronously lists objects in an S3 bucket that match a given file key prefix.
     *
     * @param {string} bucketName - The name of the S3 bucket.
     * @param {string} fileKey - The prefix of the file keys to list.
     * @returns {Promise<Object>} A promise that resolves with the list of objects if successful, or rejects with an error.
     */
    async listFile(bucketName, fileKey) {
        return new Promise((resolve, reject) => {
            this.s3.listObjects({Bucket: bucketName, Prefix: fileKey}, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * delete objects under dir recursively
     * @param {*} bucket 
     * @param {*} dir 
     * @returns 
     */
    async deleteDirectory(bucket, dir) {
        const listParams = {
            Bucket: bucket,
            Prefix: (dir.endsWith("/"))? dir : dir + "/"
        };
    
        const listedObjects = await this.s3.listObjectsV2(listParams).promise();
    
        if (listedObjects.Contents.length === 0) return true;  //no files to delete;
    
        const deleteParams = {
            Bucket: bucket,
            Delete: { Objects: [] }
        };
    
        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });
    
        await this.s3.deleteObjects(deleteParams).promise();
    
        if (listedObjects.IsTruncated) await deleteDirectory(bucket, dir); // finally delete the dir
        return true; // if no errors
    }

    /**
     * Asynchronously lists objects in an S3 bucket that match a given file key prefix.
     *
     * @param {string} bucketName - The name of the S3 bucket.
     * @param {string} dir - The prefix of the files to list.
     * @returns {Promise<Object>} A promise that resolves with the list of objects if successful, or rejects with an error.
     */
    async listFileInDir(bucketName, dir) {
        const listParams = {
            Bucket: bucketName,
            Prefix: (dir.endsWith("/")) ? dir : dir + "/"
        };

        let fileObjects = [];
        const listRecursively = async (params) => {
            try {
                const data = await this.#listObjectsV2(params);
                if (data.Contents) {
                    fileObjects.push(...data.Contents);
                    if (data.IsTruncated) {  // If more objects are available, continue with the next token
                        params.ContinuationToken = data.NextContinuationToken;
                        await listRecursively(params);
                    }
                }
            } catch (err) {
                console.error(`Failed to listing files from bucket "${bucketName}": ${err.toString()}`);
                throw err;
            }
        };

        await listRecursively(listParams);  // Start recursive listing
        return fileObjects;
    }

    async #listObjectsV2(params) {
        return new Promise((resolve, reject) => {
            this.s3.listObjectsV2(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }
}

module.exports = {
    S3Service
}