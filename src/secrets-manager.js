const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

// Initialize Secrets Manager client
const secretsManager = new SecretsManagerClient();

/**
 * Retrieves Google Service Account credentials from AWS Secrets Manager.
 * @returns {Promise<Object>} - Parsed JSON containing service account credentials.
 */
const getGoogleServiceAccount = async () => {
    const secretName = process.env.GOOGLE_SERVICE_ACCOUNT_SECRET;

    try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await secretsManager.send(command);

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
