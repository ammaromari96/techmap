# TechMap AWS — Because Clouds Need Supervision

<div align="center">

<!-- It’s badge o’clock. Enjoy the retina burn. -->

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript&logoColor=white)
![AWS CDK](https://img.shields.io/badge/AWS%20CDK-v2-orange?style=for-the-badge&logo=amazon-aws&logoColor=white)
![Node](https://img.shields.io/badge/Node-%3E%3D18-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)
![IaC](https://img.shields.io/badge/IaC-Yes-success?style=for-the-badge&logo=terraform&logoColor=white)
![CI](https://img.shields.io/badge/CI-YOLO-critical?style=for-the-badge)
![Linted](https://img.shields.io/badge/Lint-Probably-green?style=for-the-badge&logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Code%20Style-Prettier-ff69b4?style=for-the-badge&logo=prettier&logoColor=white)
![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow?style=for-the-badge&logo=conventionalcommits&logoColor=white)
![SemVer](https://img.shields.io/badge/SemVer-2.0.0-informational?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-00cc99?style=for-the-badge)
![License](https://img.shields.io/badge/License-ISC-lightgrey?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Please-Important?style=for-the-badge)
![Coverage](https://img.shields.io/badge/Coverage-100%25*-%23c0ffee?style=for-the-badge)
![Works On My Machine](https://img.shields.io/badge/Works%20On-My%20Machine-blueviolet?style=for-the-badge)
![Zero Downtime](https://img.shields.io/badge/Downtime-Zero%20(ish)-success?style=for-the-badge)
![Bug Free](https://img.shields.io/badge/Bug%20Free-Trust%20Me-red?style=for-the-badge)
![Deploy Button](https://img.shields.io/badge/Deploy-Now-9cf?style=for-the-badge)
![Sarcasm Level](https://img.shields.io/badge/Sarcasm-High-critical?style=for-the-badge)
![Coffee](https://img.shields.io/badge/Coffee-Required-brown?style=for-the-badge)

 </div>

Welcome to TechMap AWS, a TypeScript CDK project that deploys a static site on CloudFront + S3, a DynamoDB table, two Lambda functions, an API Gateway REST API, and a scheduled refresh job. It’s opinionated, reasonably small, and built to get you from zero to useful quickly.

<p align="center">
  <img src="./screenshot.png" alt="TechMap AWS screenshot" width="800" />
  <!-- Set explicit width so it renders smaller on GitHub -->
</p>

## What Is This?

- TypeScript CDK app for a small web/data stack.
- Static site served via CloudFront with S3 origin.
- API Gateway proxying to Lambda for `GET /api/companies`.
- DynamoDB on-demand table for storage.
- EventBridge rule to refresh data on a schedule.

## Features

- Single stack with sensible defaults.
- Secure by default (S3 private + OAI, HTTPS only).
- CORS enabled for the API.
- Zero-config table/func names; outputs include API URL and CloudFront domain.

## Repo Layout

- `infra/` — CDK app and stack code. Class: `InfraStack`; stack id: `techmap`.
- `lambda/` — Lambda handlers: `getCompanies.js`, `refresh.js`.
- `infra/site/` — Static site assets deployed to S3 and served by CloudFront.

## Quickstart

You’ll need Node 18+, AWS credentials, and permissions to create IAM roles, CloudFront, S3, API Gateway, DynamoDB, and EventBridge.

```bash
# 1) Install deps
cd infra && npm install

# 2) Optional: build TypeScript
npm run build

# 3) (First time per account/region) Bootstrap
npx cdk bootstrap

# 4) See the plan
npx cdk diff techmap

# 5) Deploy the stack
npx cdk deploy techmap

# 6) Tear it down
npx cdk destroy techmap
```

## Useful Commands

```bash
cd infra
npm run build          # Compile TS
npx cdk list           # Stacks in this app
npx cdk synth techmap  # Generate CloudFormation
npx cdk doctor         # Environment diagnostics
```

## FAQ

- “What’s the stack name?”  
  The stack id is `techmap`. The CDK app instantiates `new InfraStack(app, 'techmap')`.

- “Is this safe to deploy?”  
  It defaults to `RemovalPolicy.DESTROY` for convenience. Change to `RETAIN` for production and review IAM policies.

- “Where do I find endpoints?”  
  After deploy, check the CDK outputs for `ApiUrl` and `CloudFrontDomain`.

- “Why so many badges?”  
  Management asked for “more visibility.” We delivered.

## Contributing

PRs welcome! Extra points for PR titles that double as haikus and commit messages that follow Conventional Commits so the release notes look like they were written by a very organized robot.

## License

ISC — the ‘I’m So Chill’ license. See `package.json` for details you will not read.

---

If you made it this far, congrats. You’re the SRE now.
