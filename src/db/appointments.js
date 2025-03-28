const { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.APPOINTMENTS_TABLE;

/**
 * Create an appointment
 * @param {string} assistantNumber 
 * @param {string} clientNumber 
 * @param {*} data 
 */
const putAppointment = async (assistantNumber, clientNumber, data) => {
  const item = marshall({
    assistantNumber,
    clientNumber,
    ...data,
  });

  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item,
  });

  await client.send(command);
};

/**
 * Get an appointment
 * @param {string} assistantNumber 
 * @param {string} clientNumber 
 * @returns 
 */
const getAppointment = async (assistantNumber, clientNumber) => {
  const command = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ assistantNumber, clientNumber }),
  });

  const result = await client.send(command);
  return result.Item ? unmarshall(result.Item) : null;
};

/**
 * Delete an appointment
 * @param {string} assistantNumber 
 * @param {string} clientNumber 
 */
const deleteAppointment = async (assistantNumber, clientNumber) => {
  const command = new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ assistantNumber, clientNumber }),
  });

  await client.send(command);
};

/**
 * Update appointment
 * @param {string} assistantNumber 
 * @param {string} clientNumber 
 * @param {string} newData 
 */
const updateAppointment = async (assistantNumber, clientNumber, newData) => {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  Object.entries(newData).forEach(([key, value]) => {
    updateExpressions.push(`#${key} = :${key}`);
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = marshall({ value }).value;
  });

  const command = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ assistantNumber, clientNumber }),
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  await client.send(command);
};

module.exports = {
  putAppointment,
  getAppointment,
  deleteAppointment,
  updateAppointment,
};
