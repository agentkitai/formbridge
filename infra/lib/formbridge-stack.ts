import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

const ENV_CONFIG: Record<string, { cpu: number; memory: number; desiredCount: number }> = {
  staging: { cpu: 256, memory: 512, desiredCount: 1 },
  production: { cpu: 256, memory: 512, desiredCount: 2 },
};

export interface FormBridgeStackProps extends cdk.StackProps {
  envName: string;
}

export class FormBridgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FormBridgeStackProps) {
    super(scope, id, props);

    const config = ENV_CONFIG[props.envName] || ENV_CONFIG['staging'];
    const prefix = `formbridge-${props.envName}`;

    // ── VPC ────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: props.envName === 'production' ? 2 : 1,
      vpcName: `${prefix}-vpc`,
    });

    // ── Security Groups ────────────────────────────────────────────
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: 'ALB security group — HTTPS inbound',
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');

    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: 'ECS tasks — port 3000 from ALB only',
      allowAllOutbound: true,
    });
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(3000), 'ALB to ECS');

    const efsSg = new ec2.SecurityGroup(this, 'EfsSg', {
      vpc,
      description: 'EFS mount targets',
      allowAllOutbound: false,
    });
    efsSg.addIngressRule(ecsSg, ec2.Port.tcp(2049), 'ECS to EFS');

    // ── EFS ────────────────────────────────────────────────────────
    const fileSystem = new efs.FileSystem(this, 'FileSystem', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: efsSg,
      encrypted: true,
      removalPolicy: props.envName === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      fileSystemName: `${prefix}-efs`,
    });

    const accessPoint = fileSystem.addAccessPoint('DataAccessPoint', {
      path: '/formbridge-data',
      createAcl: { ownerGid: '1001', ownerUid: '1001', permissions: '755' },
      posixUser: { gid: '1001', uid: '1001' },
    });

    // ── S3 Bucket for file uploads ─────────────────────────────────
    const uploadBucket = new s3.Bucket(this, 'UploadBucket', {
      bucketName: `${prefix}-uploads-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.envName === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== 'production',
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    // ── Secrets Manager (lookup existing secrets) ──────────────────
    const oidcIssuerSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'OidcIssuerSecret', 'formbridge/oidc-issuer',
    );
    const oidcClientIdSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'OidcClientIdSecret', 'formbridge/oidc-client-id',
    );
    const webhookSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'WebhookSecret', 'formbridge/webhook-secret',
    );

    // ── CloudWatch Log Group ───────────────────────────────────────
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/formbridge',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── ECS Cluster ────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${prefix}-cluster`,
      containerInsights: props.envName === 'production',
    });

    // ── IAM Roles ──────────────────────────────────────────────────
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `${prefix}-exec-role`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant execution role access to secrets
    oidcIssuerSecret.grantRead(taskExecutionRole);
    oidcClientIdSecret.grantRead(taskExecutionRole);
    webhookSecret.grantRead(taskExecutionRole);

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `${prefix}-task-role`,
    });

    // S3 access for task role
    uploadBucket.grantReadWrite(taskRole);

    // ── Task Definition ────────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: config.cpu,
      memoryLimitMiB: config.memory,
      executionRole: taskExecutionRole,
      taskRole,
      family: `${prefix}-task`,
    });

    // EFS volume
    taskDef.addVolume({
      name: 'efs-data',
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: accessPoint.accessPointId,
          iam: 'ENABLED',
        },
      },
    });

    // Grant EFS access to task role
    fileSystem.grant(taskRole, 'elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite');

    const imageUri = scope.node.tryGetContext('imageUri')
      || `formbridge-${props.envName}:latest`;

    const container = taskDef.addContainer('formbridge', {
      image: ecs.ContainerImage.fromRegistry(imageUri),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: prefix,
      }),
      portMappings: [{ containerPort: 3000 }],
      secrets: {
        OIDC_ISSUER: ecs.Secret.fromSecretsManager(oidcIssuerSecret),
        OIDC_CLIENT_ID: ecs.Secret.fromSecretsManager(oidcClientIdSecret),
        WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(webhookSecret),
      },
      environment: {
        NODE_ENV: props.envName === 'production' ? 'production' : 'development',
        FORMBRIDGE_ENV: props.envName,
        UPLOAD_BUCKET: uploadBucket.bucketName,
        DATA_DIR: '/app/data',
      },
    });

    container.addMountPoints({
      containerPath: '/app/data',
      sourceVolume: 'efs-data',
      readOnly: false,
    });

    // ── ALB ────────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: `${prefix}-alb`,
    });

    // HTTPS listener (requires certificate ARN via context)
    const certArn = scope.node.tryGetContext('certificateArn') || '';
    const listener = alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: certArn
        ? [elbv2.ListenerCertificate.fromArn(certArn)]
        : undefined,
      // For synth without cert, use HTTP on 80 as fallback
      ...(!certArn ? { port: 80, protocol: elbv2.ApplicationProtocol.HTTP } : {}),
    });

    // ── ECS Fargate Service ────────────────────────────────────────
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: config.desiredCount,
      securityGroups: [ecsSg],
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      serviceName: `${prefix}-service`,
    });

    const targetGroup = listener.addTargets('EcsTargets', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/ready',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      targetGroupName: `${prefix}-tg`,
    });

    // ── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDns', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS name',
    });

    new cdk.CfnOutput(this, 'UploadBucketName', {
      value: uploadBucket.bucketName,
      description: 'S3 upload bucket name',
    });

    new cdk.CfnOutput(this, 'EfsFileSystemId', {
      value: fileSystem.fileSystemId,
      description: 'EFS file system ID',
    });
  }
}
