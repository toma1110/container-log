import { Fn, RemovalPolicy } from "aws-cdk-lib";
import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CfnRole, CfnManagedPolicy,CfnInstanceProfile, PolicyDocument, PolicyStatement, PolicyStatementProps, Effect, ServicePrincipal, PrincipalBase } from 'aws-cdk-lib/aws-iam';

import { Construct } from "constructs";
import { BaseResource } from "./abstract/base-resouce";
import { Vpc } from "./vpc";
import { LoadBalancer } from "./load-balancer";
import { TargetGroup } from "./target-group";
import { SecurityGroup } from "./security-group";



export class S3 extends BaseResource {
    constructor(scope: Construct,props?: cdk.StackProps) {
        super();

    // バケット名にアカウントIDを含める
    const bucketName = `sbcntr-${cdk.Stack.of(scope).account}`;

    // S3バケットの作成
    const sbcntrBucket = new s3.Bucket(scope, 'sbcntrBucket', {
      bucketName: bucketName,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // バケットARNの出力
    new cdk.CfnOutput(scope, 'BucketArn', {
      value: sbcntrBucket.bucketArn,
      description: 'The ARN of the S3 bucket',
      exportName: 'sbcntrBucketArn',
    });

    // バケット名の出力
    new cdk.CfnOutput(scope, 'BucketName', {
      value: sbcntrBucket.bucketName,
      description: 'The name of the S3 bucket',
      exportName: 'sbcntrBucketName',
    });

    // ベースイメージ格納用ECR作成（IPガチャ回避）
    const ecrrepo = new ecr.Repository(scope, 'sbcntrBaseRepo', {
      autoDeleteImages: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      repositoryName: "sbcntr-base"
    });    

  

  }
}
