import subprocess
import json

deployer_pem = "../../.secrets/deployer.pem"
deployer_address = subprocess.check_output(f"mxpy wallet bech32 --pem={deployer_pem}", shell=True).decode().strip()
print(f"Deployer address: {deployer_address}")

collectors = subprocess.check_output("ls ../../.secrets/faucet-collectors/*.pem", shell=True).decode().split()

for pem in collectors:
    try:
        address = subprocess.check_output(f"mxpy wallet bech32 --pem={pem}", shell=True).decode().strip()
        result = subprocess.check_output(f"mxpy account get --address={address} --proxy=https://testnet-gateway.multiversx.com", shell=True).decode()
        data = json.loads(result)
        balance = int(data['balance'])
        print(f"Collector {address} has {balance}")
        if balance > 500000000000000000: # > 0.5 EGLD
            print("Transferring 0.5 EGLD to deployer...")
            cmd = f"mxpy tx new --receiver={deployer_address} --value=500000000000000000 --pem={pem} --gas-limit=50000 --proxy=https://testnet-gateway.multiversx.com --chain=T --send"
            subprocess.run(cmd, shell=True, check=True)
            print("Funded! Exiting.")
            break
    except Exception as e:
        print(f"Error checking {pem}: {e}")
