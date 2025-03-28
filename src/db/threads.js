const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamoDB = new DynamoDBClient();
const TABLE_NAME = process.env.THREADS_TABLE;

/**
 * Retrieves the threadId based on 'to' and 'from'.
 * @param {string} to - Partition key
 * @param {string} from - Sort key
 * @returns {Promise<string | null>} - threadId if found, null otherwise
 */
const getThreadId = async (to, from) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      to: { S: to },   // DynamoDB requires explicit type annotations
      from: { S: from }
    }
  };

  try {
    const result = await dynamoDB.send(new GetItemCommand(params));
    return result.Item ? result.Item.threadId.S : null;
  } catch (error) {
    console.error("Error retrieving threadId:", error);
    throw new Error("Failed to retrieve threadId");
  }
};

/**
 * Creates a new threadId in the database.
 * @param {string} to - Partition key
 * @param {string} from - Sort key
 * @param {string} threadId - The thread ID to be created
 * @returns {Promise<void>}
 */
const createThreadId = async (to, from, threadId) => {
  const params = {
    TableName: TABLE_NAME,
    Item: {
      to: { S: to },
      from: { S: from },
      threadId: { S: threadId }
    }
  };

  try {
    await dynamoDB.send(new PutItemCommand(params));
  } catch (error) {
    console.error("Error creating threadId:", error);
    throw new Error("Failed to create threadId");
  }
};

module.exports = { getThreadId, createThreadId };
