import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { S3 } from '../resource/s3';


export class LogStack extends Stack {
    constructor(
        scope: Construct,
        id: string,
        props?: StackProps
    ) {
        super(scope, id, props);

        const s3 = new S3(this);

    }
}
