from pathlib import Path
from multiversx_sdk.wallet.user_pem import UserPEM

secrets_dir = Path("../../../.secrets")
for p in secrets_dir.glob("*.pem"):
    try:
        u = UserPEM.from_file(p)
        print(p.name, u.public_key.to_address("erd").to_bech32())
    except Exception as e:
        pass
