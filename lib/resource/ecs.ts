import { Fn, RemovalPolicy } from "aws-cdk-lib";
import { CfnService, CfnCluster, CfnTaskDefinition, DeploymentControllerType } from 'aws-cdk-lib/aws-ecs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from "constructs";
import { BaseResource } from "./abstract/base-resouce";
import { Vpc } from "./vpc";
import { LoadBalancer } from "./load-balancer";
import { TargetGroup } from "./target-group";
import { SecurityGroup } from "./security-group";
import { CfnRole, CfnManagedPolicy,CfnInstanceProfile, PolicyDocument, PolicyStatement, PolicyStatementProps, Effect, ServicePrincipal, PrincipalBase } from 'aws-cdk-lib/aws-iam';

// import { LogCollection } from "./log-collection";



export class Ecs extends BaseResource {
    public readonly taskDefinitionBackend: CfnTaskDefinition;
    public readonly clusterBackend: CfnCluster;
    public readonly serviceBackend: CfnService;
    public readonly taskDefinitionFrontend: CfnTaskDefinition;
    public readonly clusterFrontend: CfnCluster;
    public readonly serviceFrontend: CfnService;
    constructor(
        scope: Construct,
        vpc: Vpc,
        accountId: string,
        securityGroup: SecurityGroup,
        // subnet: Subnet,
        targetGroup: TargetGroup,
        loadBalancer: LoadBalancer
    ) {
        super();
        const sbcntrStgRoleTaskDefinitionArn = Fn.importValue('sbcntr-stg-role-taskDefinitionArn');
        const sbcntrstgsubnetcontainer1aId = Fn.importValue('sbcntr-stg-subnet-container-1a');
        const sbcntrstgsubnetcontainer1cId = Fn.importValue('sbcntr-stg-subnet-container-1c');


        // S3へログ転送をするタスクロールの作成
        const policyStatement = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
            'kms:Decrypt',
            'kms:GenerateDataKey'
            ],
            resources:['*']
        });
    
        const policyDocument = new PolicyDocument({
            statements: [policyStatement]
        });
    
        const sbcntrS3Policy = new CfnManagedPolicy(scope, 'sbcntrS3Policy', {
            policyDocument: policyDocument,
            managedPolicyName: 'sbcntrS3Policy',
            roles: ['sbcntr-ecsTaskRole']
        });
    
        const policyStatement2 = new PolicyStatement({
            effect: Effect.ALLOW,
            principals: [new ServicePrincipal('ecs-tasks.amazonaws.com')],
            actions: ['sts:AssumeRole']
        }
        );
    
        const policyDocument2 = new PolicyDocument({
            statements: [policyStatement2]
        });
    
        const sbcntrS3Role = new CfnRole(scope, 'sbcntrS3Role', {
            assumeRolePolicyDocument:  policyDocument2,
            
            managedPolicyArns: [
            'arn:aws:iam::aws:policy/AmazonS3FullAccess',
            // sbcntrS3Policy.attrId,
            'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess'
            ],
            roleName: 'sbcntr-ecsTaskRole'
        });
    
        sbcntrS3Policy.addDependency(sbcntrS3Role)        


        // CloudWatch Logsのロググループを作成
        const logGroupBackend = new logs.LogGroup(scope, 'BackendLogGroup', {
            logGroupName: '/ecs/sbcntr-stg-backend',
            removalPolicy: RemovalPolicy.DESTROY, // スタックの削除時にロググループも削除する
        });

        const logGroupFrontend = new logs.LogGroup(scope, 'FrontendLogGroup', {
            logGroupName: '/ecs/sbcntr-stg-frontend',
            removalPolicy: RemovalPolicy.DESTROY, // スタックの削除時にロググループも削除する
        });

        // FireLens用コンテナのロググループ作成
        const sbcntrFirelensContainerLogGroup = new logs.LogGroup(scope, 'sbcntrFirelensContainerLogGroup', {
            logGroupName: '/aws/ecs/sbcntr-firelens-container',
            removalPolicy: RemovalPolicy.DESTROY, // スタックの削除時にロググループも削除する
        });

        this.taskDefinitionBackend = new CfnTaskDefinition(scope, 'backend-def', {
            containerDefinitions: [
                // 【ログ収集運用】FireLens利用に変更
                {
                    essential: true,
                    image: accountId + '.dkr.ecr.ap-northeast-1.amazonaws.com/sbcntr-base:log-router',
                    name: 'log_router',
                    firelensConfiguration: {
                        type: 'fluentbit',
                        options: {
                            'config-file-type': 'file',
                            'config-file-value': '/fluent-bit/custom.conf'
                        }
                    },
                    environment: [
                        {
                            name: "APP_ID",
                            value: "backend-def"
                        },
                        {
                            name: "AWS_ACCOUNT_ID",
                            value: accountId
                        },
                        {
                            name: "AWS_REGION",
                            value: "ap-northeast-1"
                        },
                        {
                            name: "LOG_BUCKET_NAME",
                            value: "sbcntr-" + accountId
                        },
                        {
                            name: "LOG_GROUP_NAME",
                            value: "/ecs/sbcntr-stg-backend"
                        }
                    ],
                    logConfiguration: {
                    logDriver: 'awslogs',
                    options: {
                        'awslogs-group': sbcntrFirelensContainerLogGroup.logGroupName,
                        'awslogs-region': 'ap-northeast-1',
                        'awslogs-stream-prefix': 'firelens'
                        }
                    },
                    memoryReservation: 50
                },

                //  メインアプリケーションコンテナ
                {
                image: accountId + '.dkr.ecr.ap-northeast-1.amazonaws.com/sbcntr-stg-backend:v1',
                name: 'app',

                // the properties below are optional
                cpu: 256,
                essential: true,
                memoryReservation: 512,
                portMappings: [{
                    appProtocol: 'http',
                    containerPort: 80,
                    hostPort: 80,
                    name: 'app',
                    protocol: 'tcp',
                }],

                
                // logConfiguration: {
                //     logDriver: 'awslogs',
                //     options: {
                //         'awslogs-group': logGroupBackend.logGroupName,
                //         'awslogs-region': 'ap-northeast-1',
                //         'awslogs-stream-prefix': 'ecs',
                //     },
                // },

                // 【ログ収集運用】FireLens利用に変更
                logConfiguration: {
                    logDriver: 'awsfirelens',
                },
            }],
            cpu: '512',
            executionRoleArn: sbcntrStgRoleTaskDefinitionArn,
            memory: '1024',
            networkMode: 'awsvpc',
            tags: [{
                key: 'Name',
                value: this.createResourceName(scope, 'backend-taskdefinition'),
            }],
            taskRoleArn: sbcntrS3Role.attrArn
        });

        this.clusterBackend = new CfnCluster(scope, 'backend-cluster', {
            capacityProviders: ['FARGATE'],
            clusterName: this.createResourceName(scope, 'backend-cluster'),
        });


        const serviceBackend = new CfnService(scope, 'backend-service', {
            capacityProviderStrategy: [{
                base: 0,
                capacityProvider: 'FARGATE',
                weight: 1,
            }],
            cluster: this.clusterBackend.attrArn,
            desiredCount: 1,
            loadBalancers: [{
                containerName: 'app',
                containerPort: 80,
                targetGroupArn: targetGroup.tgSbcntrDemoBlue.attrTargetGroupArn,
            }],
            networkConfiguration: {
                awsvpcConfiguration: {
                    // assignPublicIp: 'assignPublicIp',
                    securityGroups: [securityGroup.con.attrGroupId],
                    subnets: [sbcntrstgsubnetcontainer1aId, sbcntrstgsubnetcontainer1cId],
                },
            },
            serviceName: this.createResourceName(scope, 'backend-service'),
            taskDefinition: this.taskDefinitionBackend.attrTaskDefinitionArn,
            deploymentController: {
                type: DeploymentControllerType.CODE_DEPLOY
            }
        });

        // // 「コンテナのリリースを体験」実行の際にコメントイン
        // const RDSSecretSbcntrMysqlArn = Fn.importValue('RDSSecret-sbcntr-mysql');

        this.taskDefinitionFrontend = new CfnTaskDefinition(scope, 'frontend-def', {
            containerDefinitions: [{
                // 「コンテナのリリースを体験」実行の際にコメントアウト
                image: accountId + '.dkr.ecr.ap-northeast-1.amazonaws.com/sbcntr-stg-frontend:v1',
                // // 「コンテナのリリースを体験」実行の際にコメントイン
                // image: accountId + '.dkr.ecr.ap-northeast-1.amazonaws.com/sbcntr-stg-frontend:dbv1',
                name: 'app',

                // the properties below are optional
                cpu: 256,
                essential: true,
                memoryReservation: 512,
                portMappings: [{
                    appProtocol: 'http',
                    containerPort: 80,
                    hostPort: 80,
                    name: 'app',
                    protocol: 'tcp',
                }],
                // // 「コンテナのリリースを体験」実行の際にコメントイン
                // secrets: [ // Secrets Managerからのシークレットを追加
                //     {
                //         name: 'DB_HOST',
                //         valueFrom: RDSSecretSbcntrMysqlArn + ':host::'
                //     },
                //     {
                //         name: 'DB_NAME',
                //         valueFrom: RDSSecretSbcntrMysqlArn + ':dbname::'
                //     },
                //     {
                //         name: 'DB_USERNAME',
                //         valueFrom: RDSSecretSbcntrMysqlArn + ':username::'
                //     },
                //     {
                //         name: 'DB_PASSWORD',
                //         valueFrom: RDSSecretSbcntrMysqlArn + ':password::'
                //     },
                // ],
                environment: [
                    {
                        name: "SESSION_SECRET_KEY",
                        value: "41b678c65b37bf99c37bcab522802760"
                    },
                    {
                        name: "NOTIF_SERVICE_HOST",
                        value: "http://" + loadBalancer.albInternal.attrDnsName
                    },
                    {
                        name: "APP_SERVICE_HOST",
                        value: "http://" + loadBalancer.albInternal.attrDnsName
                    }
                ],
                logConfiguration: {
                    logDriver: 'awslogs',
                    options: {
                        'awslogs-group': logGroupFrontend.logGroupName,
                        'awslogs-region': 'ap-northeast-1',
                        'awslogs-stream-prefix': 'ecs',
                    },
                },
            }],
            cpu: '512',
            executionRoleArn: sbcntrStgRoleTaskDefinitionArn,
            memory: '1024',
            networkMode: 'awsvpc',
            tags: [{
                key: 'Name',
                value: this.createResourceName(scope, 'frontend-taskdefinition'),
            }],
        });

        this.clusterFrontend = new CfnCluster(scope, 'frontend-cluster', {
            capacityProviders: ['FARGATE'],
            clusterName: this.createResourceName(scope, 'frontend-cluster'),
        });


        const serviceFrontend = new CfnService(scope, 'frontend-service', {
            capacityProviderStrategy: [{
                base: 0,
                capacityProvider: 'FARGATE',
                weight: 1,
            }],
            cluster: this.clusterFrontend.attrArn,
            desiredCount: 1,
            loadBalancers: [{
                containerName: 'app',
                containerPort: 80,
                targetGroupArn: targetGroup.tgFrontend.attrTargetGroupArn,
            }],
            networkConfiguration: {
                awsvpcConfiguration: {
                    // assignPublicIp: 'assignPublicIp',
                    securityGroups: [securityGroup.fcon.attrGroupId],
                    subnets: [sbcntrstgsubnetcontainer1aId, sbcntrstgsubnetcontainer1cId],
                },
            },
            serviceName: this.createResourceName(scope, 'frontend-service'),
            taskDefinition: this.taskDefinitionFrontend.attrTaskDefinitionArn,
            // deploymentController: {
            //     type: DeploymentControllerType.CODE_DEPLOY
            // }
        });

    }

}
