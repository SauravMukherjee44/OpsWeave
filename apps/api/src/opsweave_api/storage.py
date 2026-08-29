import asyncio
import hashlib
from pathlib import Path
from typing import BinaryIO

import boto3

from .config import Settings


class ArtifactStorage:
    def __init__(self, settings: Settings):
        self.settings = settings

    def presign_post(self, key: str, media_type: str, max_bytes: int) -> dict:
        if not self.settings.artifact_bucket:
            raise RuntimeError("S3 artifact bucket is not configured")
        client = boto3.client("s3", region_name=self.settings.aws_region)
        return client.generate_presigned_post(
            Bucket=self.settings.artifact_bucket,
            Key=key,
            Fields={"Content-Type": media_type},
            Conditions=[{"Content-Type": media_type}, ["content-length-range", 1, max_bytes]],
            ExpiresIn=900,
        )

    async def save_local(self, key: str, file: BinaryIO) -> tuple[Path, int, str]:
        destination = self.settings.local_upload_dir / key
        destination.parent.mkdir(parents=True, exist_ok=True)

        def copy() -> tuple[int, str]:
            digest = hashlib.sha256()
            size = 0
            with destination.open("wb") as output:
                while chunk := file.read(1024 * 1024):
                    size += len(chunk)
                    if size > self.settings.max_upload_bytes:
                        output.close()
                        destination.unlink(missing_ok=True)
                        raise ValueError("File exceeds upload limit")
                    digest.update(chunk)
                    output.write(chunk)
            return size, digest.hexdigest()

        size, checksum = await asyncio.to_thread(copy)
        return destination, size, checksum

    async def upload_file(self, path: Path, key: str, media_type: str) -> None:
        if not self.settings.artifact_bucket:
            raise RuntimeError("S3 artifact bucket is not configured")

        def upload() -> None:
            boto3.client("s3", region_name=self.settings.aws_region).upload_file(
                str(path),
                self.settings.artifact_bucket,
                key,
                ExtraArgs={"ContentType": media_type, "Metadata": {"application": "OpsWeave"}},
            )

        await asyncio.to_thread(upload)
