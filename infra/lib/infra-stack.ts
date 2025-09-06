import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB: on-demand billing
    const table = new dynamodb.Table(this, 'CompaniesTable', {
      partitionKey: { name: 'name', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // change to RETAIN for production
    });

    // Lambda: Refresh (scheduled)
    const refreshFn = new lambdaNode.NodejsFunction(this, 'RefreshCompaniesFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.resolve(__dirname, '../../lambda/refresh.js'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(2),
      bundling: { minify: true, target: 'node22' },
      environment: {
        TABLE_NAME: table.tableName,
        TECHMAP_URL: process.env.TECHMAP_URL || 'https://www.techmap.dev/',
      },
    });
    table.grantReadWriteData(refreshFn);

    // EventBridge Schedule: every 6 hours
    new events.Rule(this, 'RefreshSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      targets: [new targets.LambdaFunction(refreshFn)],
    });

    // Lambda: Read API
    const getFn = new lambdaNode.NodejsFunction(this, 'GetCompaniesFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.resolve(__dirname, '../../lambda/getCompanies.js'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      bundling: { minify: true, target: 'node22' },
      environment: {
        TABLE_NAME: table.tableName,
      },
    });
    table.grantReadData(getFn);

    // API Gateway with CORS
    const api = new apigw.RestApi(this, 'CompaniesApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        stageName: 'prod',
      },
    });
    const apiPrefix = api.root.addResource('api');
    apiPrefix.addResource('companies').addMethod('GET', new apigw.LambdaIntegration(getFn));

    // Outputs
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url ?? '' });

    // Static Website: S3 + CloudFront (with API proxy)
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'SiteOAI');
    const s3Origin = new origins.S3Origin(siteBucket, { originAccessIdentity: oai });
    const region = cdk.Stack.of(this).region;
    const apiDomain = `${api.restApiId}.execute-api.${region}.${cdk.Aws.URL_SUFFIX}`;
    const apiOrigin = new origins.HttpOrigin(apiDomain, {
      originPath: '/prod',
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const apiCache = new cloudfront.CachePolicy(this, 'CompaniesApiCache', {
      defaultTtl: cdk.Duration.minutes(10),
      minTtl: cdk.Duration.minutes(1),
      maxTtl: cdk.Duration.hours(1),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const dist = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      additionalBehaviors: {
        'api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: apiCache,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // Bucket policy for OAI
    siteBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new cdk.aws_iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
    }));

    // Deploy static assets from ../site
    const sitePath = path.resolve(__dirname, '../site');
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(sitePath)],
      destinationBucket: siteBucket,
      distribution: dist,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'CloudFrontDomain', { value: dist.domainName });
  }
}
