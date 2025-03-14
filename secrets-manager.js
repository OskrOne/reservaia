const AWS = require("aws-sdk");

// Initialize Secrets Manager client
const secretsManager = new AWS.SecretsManager();

/**
 * Retrieves Google Service Account credentials from AWS Secrets Manager.
 * @returns {Promise<Object>} - Parsed JSON containing service account credentials.
 */
const getGoogleServiceAccount = async () => {
    const secretName = process.env.GOOGLE_SERVICE_ACCOUNT_SECRET;

    try {
        const response = await secretsManager.getSecretValue({ SecretId: secretName }).promise();

        if (response.SecretString) {
            return JSON.parse(response.SecretString);
        }

        throw new Error("SecretString is empty");
    } catch (error) {
        console.error("❌ Error retrieving secret:", error);
        throw new Error("Failed to retrieve Google Service Account credentials");
    }
};

module.exports = { getGoogleServiceAccount };
