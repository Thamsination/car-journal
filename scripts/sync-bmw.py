"""Fetch vehicle data from BMW Connected Drive and write to vehicle.json.

Uses a stored refresh token (from BMW_OAUTH_STORE secret) to avoid captcha.
"""

import asyncio
import json
import os
import sys
from pathlib import Path


async def main():
    username = os.environ.get("BMW_USERNAME")
    password = os.environ.get("BMW_PASSWORD")
    region = os.environ.get("BMW_REGION", "rest_of_world")
    vin = os.environ.get("BMW_VIN")
    oauth_store_json = os.environ.get("BMW_OAUTH_STORE", "")

    if not all([username, password, vin]):
        print("Missing BMW_USERNAME, BMW_PASSWORD, or BMW_VIN")
        sys.exit(1)

    if not oauth_store_json:
        print("Missing BMW_OAUTH_STORE secret. Run scripts/bmw-auth.py locally first.")
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

        oauth_store = json.loads(oauth_store_json)
        account = MyBMWAccount(username, password, bmw_region)
        if "refresh_token" in oauth_store:
            account.config.authentication.refresh_token = oauth_store["refresh_token"]
        if "gcid" in oauth_store:
            account.config.authentication.gcid = oauth_store["gcid"]
        if "access_token" in oauth_store:
            account.config.authentication.access_token = oauth_store["access_token"]

        await account.get_vehicles()

        vehicle = account.get_vehicle(vin)
        if not vehicle:
            print(f"Vehicle {vin} not found")
            sys.exit(1)

        data = {
            "vin": vin,
            "odometer": vehicle.mileage[0] if vehicle.mileage else None,
            "fuelLevel": None,
            "lastSynced": vehicle.timestamp.isoformat() if vehicle.timestamp else None,
        }

        if hasattr(vehicle, "fuel_and_battery") and vehicle.fuel_and_battery:
            fb = vehicle.fuel_and_battery
            if hasattr(fb, "remaining_fuel_percent"):
                data["fuelLevel"] = fb.remaining_fuel_percent

        output_path = Path(__file__).parent.parent / "static" / "data" / "vehicle.json"
        output_path.write_text(json.dumps(data, indent=2) + "\n")
        print(f"Updated vehicle.json: {data['odometer']} km")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
