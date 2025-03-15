const AWS = require("aws-sdk");

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.BUSINESSES_TABLE;

/**
 * Retrieves business details using the phone number.
 * @param {string} phonenumber - The phone number of the business.
 * @returns {Promise<Object|null>} - Business details if found, otherwise null.
 */
const getBusinessByPhone = async (phonenumber) => {
    const params = {
        TableName: TABLE_NAME,
        Key: { phonenumber },
    };

    try {
        const result = await dynamoDb.get(params).promise();
        return result.Item || null;
    } catch (error) {
        console.error("❌ Error fetching business data:", error);
        throw new Error("Failed to retrieve business details");
    }
};

module.exports = { getBusinessByPhone };
