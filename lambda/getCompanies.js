'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const TABLE_NAME = process.env.TABLE_NAME;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

function cacheHeaders() {
  return {
    'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=60, stale-if-error=86400',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

exports.handler = async (event) => {
  if (!TABLE_NAME) return { statusCode: 500, headers: cors(), body: JSON.stringify({ ok: false, error: 'TABLE_NAME not set' }) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };

  try {
    let items = [];
    let ExclusiveStartKey;
    do {
      const out = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey,
        ProjectionExpression: '#n, id, website, linkedin, crunchbase, coordinates, description, founded, employees, logo, logoFallback, updatedAt',
        FilterExpression: '#n <> :meta',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':meta': '__meta__' },
      }));
      items = items.concat(out.Items || []);
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    const body = JSON.stringify({ ok: true, count: items.length, data: items });
    return { statusCode: 200, headers: { ...cors(), ...cacheHeaders() }, body };
  } catch (err) {
    return { statusCode: 500, headers: { ...cors(), ...cacheHeaders() }, body: JSON.stringify({ ok: false, error: err?.message || 'scan_failed' }) };
  }
};
