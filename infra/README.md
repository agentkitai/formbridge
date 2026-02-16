# FormBridge CDK Infrastructure

AWS CDK v2 stack for deploying FormBridge to ECS Fargate.

## Architecture

- **ECS Fargate** — 256 CPU / 512 MB, container on port 3000
- **EFS** — Mounted at `/app/data` for SQLite persistence (POSIX user 1001)
- **ALB** — HTTPS (443) with health check on `GET /ready`
- **S3** — File upload bucket with CORS, lifecycle rules, SSE
- **Secrets Manager** — `formbridge/oidc-issuer`, `formbridge/oidc-client-id`, `formbridge/webhook-secret`
- **CloudWatch** — Log group `/ecs/formbridge`

## Prerequisites

1. **AWS CDK Bootstrap** — Run `cdk bootstrap` in the target account/region
2. **Secrets** — Create the three secrets in Secrets Manager before deploying
3. **ECR Image** — Push the FormBridge Docker image to ECR
4. **ACM Certificate** — For HTTPS, have a certificate ARN ready

## Context Values

| Key              | Description                         | Required |
|------------------|-------------------------------------|----------|
| `env`            | `staging` or `production`           | No (default: `staging`) |
| `imageUri`       | ECR image URI for FormBridge        | Yes (for deploy) |
| `certificateArn` | ACM certificate ARN for HTTPS       | Yes (for HTTPS) |

## Commands

```bash
# Install dependencies
npm install

# Synthesize CloudFormation template
npx cdk synth

# Synth for production
npx cdk synth --context env=production

# Deploy staging
npx cdk deploy --context env=staging \
  --context imageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/formbridge:latest \
  --context certificateArn=arn:aws:acm:us-east-1:123456789:certificate/abc-123

# Deploy production
npx cdk deploy --context env=production \
  --context imageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/formbridge:latest \
  --context certificateArn=arn:aws:acm:us-east-1:123456789:certificate/abc-123

# Diff (preview changes)
npx cdk diff --context env=staging
```

## Security

- ALB SG: Inbound 443 only
- ECS SG: Inbound 3000 from ALB only
- EFS SG: Inbound 2049 from ECS only
- S3: Block all public access, SSE enabled
- No `*` resource IAM policies — all scoped to specific resources
- Secrets resolved at deploy time via Secrets Manager references
