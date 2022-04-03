const AWS = require("aws-sdk");
const S3 = new AWS.S3;
const dynamo = new AWS.DynamoDB.DocumentClient();
const { getHash } = require("./indeed");
const TableName = process.env.TABLE_NAME;

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

const upload = (b64, fileName) => {
  const buffer = Buffer.from(b64, "base64");
  const params = {
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
    Body: buffer
  }
  
  return new Promise (yes => {
    S3.putObject(params, (err, data) => {
      if (err) {
        return yes(err)
      }
      yes(fileName);
    })
  })
}

const saveSMS = (text) => {
  console.log ('SAVESMS...'); 
  const regex = /(\d+)\./.exec(text);
  const fileName = 'messages.txt';
  const body = regex[1];
  const params = {
    Bucket: process.env.BUCKET_NAME,
    Key: fileName,
    Body: body
  }
  
  console.log ({
      message: 'I AM UPLOADING THE FILE NOW!!', 
      params: params || 'PARAMS UNDEFINED', 
      text: text || 'TEXT UNDEFINED', 
      body
  })
  
  return new Promise (yes => {
    S3.putObject(params, (err, data) => {
      if (err) {
        return yes({ err })
      }
      yes({ fileName });
    })
  })
}

// main handler processes incoming requests
exports.handler = async (event, context) => { 
  let body;
  let statusCode = 200;
  let headers = {
    "Content-Type": "application/json"
  };
  
  !!event.body && console.log ({LOADING: event.body})
  
  console.log ({ action: event.routeKey, length: event.body?.length })

  try {
    switch (event.routeKey) {
      case "GET /":
        body = uniqueId();
        break;
      case "DELETE /tests/{suiteID}":
        await dynamo
          .delete({
            TableName,
            Key: {
              suiteID: event.pathParameters.suiteID
            }
          })
          .promise();
        body = `Deleted item ${event.pathParameters.suiteID}`;
        break;
      case "GET /tests/{suiteID}":
        body = await dynamo
          .get({
            TableName,
            Key: {
              suiteID: event.pathParameters.suiteID
            }
          })
          .promise();
        break;
      case "GET /tests":
        body = await dynamo.scan({ TableName }).promise();
        break;
      case "POST /twilio": 
        body = await saveSMS(event.body);
        break;
      case "POST /indeed": 
        body = await getHash(event.body);
        break;
      case "POST /slack": 
        headers = {
          "Content-Type": "text/plain"
        };

        body = JSON.parse(event.body).challenge;
        break;
      case "POST /tests":
        const attempt = await upload(event.body, event.headers['file-name']); 
        body = attempt;
        break;
      case "PUT /tests":
        let requestJSON = JSON.parse(event.body);
        await dynamo
          .put({
            TableName,
            Item: {
               ...requestJSON
            }
          })
          .promise();
        body = `${requestJSON.suiteID}`;
        break;
      default:
        throw new Error(`Unsupported route: "${event.routeKey}"`);
    }
  } catch (err) {
    statusCode = 400;
    body = err.message;
  } finally {
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
    headers
  };
};
