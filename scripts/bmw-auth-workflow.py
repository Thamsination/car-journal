"""
BMW authentication for GitHub Actions workflow.

Authenticates with BMW using credentials + hCaptcha token,
then stores the resulting OAuth tokens as a GitHub secret.
"""

import asyncio
import base64
import json
import os
import sys

import httpx
from nacl import encoding, public


def encrypt_secret(public_key: str, secret_value: str) -> str:
    """Encrypt a secret using the repo's public key (libsodium sealed box)."""
    pk = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(sealed).decode("utf-8")


async def store_github_secret(name: str, value: str, repo: str, token: str):
    """Store an encrypted secret in the GitHub repository."""
    api = f"https://api.github.com/repos/{repo}/actions/secrets"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{api}/public-key", headers=headers)
        resp.raise_for_status()
        pk_data = resp.json()

        encrypted = encrypt_secret(pk_data["key"], value)

        resp = await client.put(
            f"{api}/{name}",
            headers=headers,
            json={"encrypted_value": encrypted, "key_id": pk_data["key_id"]},
        )
        resp.raise_for_status()
        print(f"  Secret {name} stored successfully")


async def main():
    username = os.environ.get("BMW_USERNAME")
    password = os.environ.get("BMW_PASSWORD")
    region = os.environ.get("BMW_REGION", "rest_of_world")
    vin = os.environ.get("BMW_VIN")
    captcha_token = os.environ.get("BMW_CAPTCHA_TOKEN")
    gh_pat = os.environ.get("GH_PAT")
    gh_repo = os.environ.get("GH_REPO")

    if not all([username, password, vin, captcha_token]):
        print("Missing required environment variables")
        sys.exit(1)

    if not gh_pat or not gh_repo:
        print("Missing GH_PAT or GH_REPO for storing secrets")
        sys.exit(1)

    try:
        from bimmer_connected.account import MyBMWAccount
        from bimmer_connected.api.regions import Regions

        region_map = {
            "north_america": Regions.NORTH_AMERICA,
            "china": Regions.CHINA,
            "rest_of_world": Regions.REST_OF_WORLD,
        }
        bmw_region = region_map.get(region, Regions.REST_OF_WORLD)

        print("Authenticating with BMW...")
        account = MyBMWAccount(
            username, password, bmw_region,
            hcaptcha_token=captcha_token,
        )
        await account.get_vehicles()

        print("Authentication successful!")
        for v in account.vehicles:
            print(f"  Found: {v.name} — VIN: {v.vin}")
            if v.mileage:
                print(f"  Odometer: {v.mileage[0]} {v.mileage[1]}")

        oauth_store = {
            "refresh_token": account.config.authentication.refresh_token,
            "gcid": account.config.authentication.gcid,
            "access_token": account.config.authentication.access_token,
        }

        print("Storing OAuth tokens as GitHub secret...")
        await store_github_secret(
            "BMW_OAUTH_STORE",
            json.dumps(oauth_store),
            gh_repo,
            gh_pat,
        )

        print("Done! BMW connection established.")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
