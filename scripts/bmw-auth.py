"""
One-time BMW authentication helper.

Steps:
1. Go to https://bimmer-connected.readthedocs.io/en/stable/captcha/rest_of_world.html
2. Solve the captcha and submit the form
3. Copy the resulting token
4. Run: python3 scripts/bmw-auth.py YOUR_EMAIL YOUR_PASSWORD YOUR_CAPTCHA_TOKEN
5. Copy the printed JSON and save it as the BMW_OAUTH_STORE secret in your GitHub repo
"""

import asyncio
import json
import sys


async def main():
    if len(sys.argv) < 4:
        print("Usage: python3 bmw-auth.py <email> <password> <captcha_token>")
        print()
        print("Get your captcha token from:")
        print("https://bimmer-connected.readthedocs.io/en/stable/captcha/rest_of_world.html")
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    captcha_token = sys.argv[3]

    try:
        from bimmer_connected.account import MyBMWAccount
        from bimmer_connected.api.regions import Regions

        account = MyBMWAccount(
            username, password, Regions.REST_OF_WORLD,
            hcaptcha_token=captcha_token
        )
        await account.get_vehicles()

        oauth_store = {
            "refresh_token": account.config.authentication.refresh_token,
            "gcid": account.config.authentication.gcid,
            "access_token": account.config.authentication.access_token,
        }

        print()
        print("Authentication successful!")
        print()
        print("Copy the following JSON and save it as the BMW_OAUTH_STORE")
        print("secret in your GitHub repo settings:")
        print("https://github.com/Thamsination/car-journal/settings/secrets/actions")
        print()
        print(json.dumps(oauth_store))
        print()

        for v in account.vehicles:
            print(f"Found vehicle: {v.name} — VIN: {v.vin}")
            if v.mileage:
                print(f"  Odometer: {v.mileage[0]} {v.mileage[1]}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
