"""Create or reuse the portfolio-safe Bedrock Data Automation project."""

import json

import boto3

PROFILE = "opsweave"
REGION = "us-east-1"
PROJECT_NAME = "opsweave-dev-multimodal-ingestion"


def main() -> None:
    client = boto3.Session(profile_name=PROFILE, region_name=REGION).client("bedrock-data-automation")
    existing = client.list_data_automation_projects(maxResults=100).get("projects", [])
    project = next((item for item in existing if item.get("projectName") == PROJECT_NAME), None)
    if project is None:
        project = client.create_data_automation_project(
            projectName=PROJECT_NAME,
            projectDescription="Multimodal evidence extraction for synthetic damaged-shipment operations",
            projectStage="LIVE",
            standardOutputConfiguration={
                "document": {
                    "extraction": {"granularity": {"types": ["DOCUMENT", "PAGE", "ELEMENT", "LINE"]}, "boundingBox": {"state": "ENABLED"}},
                    "generativeField": {"state": "ENABLED"},
                    "outputFormat": {"textFormat": {"types": ["MARKDOWN"]}, "additionalFileFormat": {"state": "ENABLED"}},
                },
                "image": {
                    "extraction": {"category": {"state": "ENABLED", "types": ["TEXT_DETECTION"]}, "boundingBox": {"state": "ENABLED"}},
                    "generativeField": {"state": "ENABLED", "types": ["IMAGE_SUMMARY"]},
                },
                "audio": {
                    "extraction": {"category": {"state": "ENABLED", "types": ["TRANSCRIPT"]}},
                    "generativeField": {"state": "ENABLED", "types": ["AUDIO_SUMMARY", "TOPIC_SUMMARY"]},
                },
            },
            overrideConfiguration={
                "document": {"sensitiveDataConfiguration": {"detectionMode": "DETECTION_AND_REDACTION"}},
                "image": {"sensitiveDataConfiguration": {"detectionMode": "DETECTION_AND_REDACTION"}},
                "audio": {"sensitiveDataConfiguration": {"detectionMode": "DETECTION_AND_REDACTION"}},
            },
            tags=[{"key": "Application", "value": "OpsWeave"}, {"key": "Environment", "value": "dev"}],
        )
    print(json.dumps({"projectArn": project["projectArn"], "projectName": PROJECT_NAME}))


if __name__ == "__main__":
    main()
