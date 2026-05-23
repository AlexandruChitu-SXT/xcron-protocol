import requests
import time
import sys
from pathlib import Path
from multiversx_sdk import (
    Address,
    Transaction,
    TransactionComputer,
    ProxyNetworkProvider,
    UserSigner
)

# Network setup
provider = ProxyNetworkProvider("https://testnet-gateway.multiversx.com")
signer_path = Path("../../.secrets/alice_testnet.pem")
if not signer_path.exists():
    signer_path = Path(".secrets/alice_testnet.pem")
signer = UserSigner.from_pem_file(signer_path)
sender_address = signer.get_pubkey().to_address("erd")

contract_address = Address.new_from_bech32("erd1qqqqqqqqqqqqqpgqhlj93c58l0kmvjdzl965jeclz7r5lw2e7k8sfc2hlx")

print(f"Alice Address: {sender_address.to_bech32()}")
print(f"Contract Address: {contract_address.to_bech32()}")

def fetch_molecule_data(name):
    print(f"\nFetching data for '{name}' from PubChem...")
    # Get 3D coords and bonds
    url_3d = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/JSON?record_type=3d"
    r = requests.get(url_3d)
    if r.status_code != 200:
        print(f"Error fetching 3D record: {r.status_code}")
        return None
    data_3d = r.json()

    # Get InChIKey
    url_key = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/property/InChIKey/JSON"
    r = requests.get(url_key)
    if r.status_code != 200:
        print(f"Error fetching InChIKey: {r.status_code}")
        return None
    inchikey = r.json()["PropertyTable"]["Properties"][0]["InChIKey"]
    
    comp = data_3d["PC_Compounds"][0]
    
    # Parse atoms
    element_list = comp["atoms"]["element"]
    aid_list = comp["atoms"]["aid"]
    
    conformer = comp["coords"][0]["conformers"][0]
    x_coords = conformer["x"]
    y_coords = conformer["y"]
    z_coords = conformer["z"]
    
    atoms = []
    for i in range(len(element_list)):
        # Convert Angstroms to femtometers (1 A = 100,000 fm)
        x_fm = int(round(x_coords[i] * 100000))
        y_fm = int(round(y_coords[i] * 100000))
        z_fm = int(round(z_coords[i] * 100000))
        atoms.append({
            "atomic_number": element_list[i],
            "x_fm": x_fm,
            "y_fm": y_fm,
            "z_fm": z_fm
        })
        
    # Parse bonds
    bonds = []
    if "bonds" in comp:
        aid1_list = comp["bonds"]["aid1"]
        aid2_list = comp["bonds"]["aid2"]
        order_list = comp["bonds"]["order"]
        for i in range(len(aid1_list)):
            # Convert 1-indexed aid to 0-indexed idx
            atom1_idx = aid1_list[i] - 1
            atom2_idx = aid2_list[i] - 1
            
            order = order_list[i]
            # Map order to contract bond_type: 1 -> 10, 2 -> 20, 3 -> 30
            # If it's aromatic or double, map accordingly
            bond_type = 10
            if order == 1:
                bond_type = 10
            elif order == 2:
                bond_type = 20
            elif order == 3:
                bond_type = 30
            else:
                bond_type = 10
                
            bonds.append({
                "atom1_idx": atom1_idx,
                "atom2_idx": atom2_idx,
                "bond_type": bond_type
            })
            
    print(f"Successfully loaded {len(atoms)} atoms and {len(bonds)} bonds. InChIKey: {inchikey}")
    return {
        "atoms": atoms,
        "bonds": bonds,
        "inchikey": inchikey
    }

def encode_i64(val):
    # Two's complement encoding for i64 big-endian
    if val < 0:
        val = (1 << 64) + val
    return val.to_bytes(8, byteorder='big').hex()

def encode_u32(val):
    return val.to_bytes(4, byteorder='big').hex()

def encode_u8(val):
    return val.to_bytes(1, byteorder='big').hex()

def serialize_payload(mol_data):
    hex_str = ""
    
    # 1. atoms: ManagedVec<AtomCoord>
    hex_str += encode_u32(len(mol_data["atoms"]))
    for atom in mol_data["atoms"]:
        hex_str += encode_u8(atom["atomic_number"])
        hex_str += encode_i64(atom["x_fm"])
        hex_str += encode_i64(atom["y_fm"])
        hex_str += encode_i64(atom["z_fm"])
        
    # 2. bonds: ManagedVec<Bond>
    hex_str += encode_u32(len(mol_data["bonds"]))
    for bond in mol_data["bonds"]:
        hex_str += encode_u32(bond["atom1_idx"])
        hex_str += encode_u32(bond["atom2_idx"])
        hex_str += encode_u8(bond["bond_type"])
        
    # 3. inchikey: ManagedBuffer
    key_bytes = mol_data["inchikey"].encode('ascii')
    hex_str += encode_u32(len(key_bytes))
    hex_str += key_bytes.hex()
    
    return hex_str

def send_validation_tx(mol_name, payload_hex):
    # Get current nonce
    sender_account = provider.get_account(sender_address)
    nonce = sender_account.nonce
    
    # Build tx data: validatePhysicalMatrix@<payload_hex>
    tx_data = f"validatePhysicalMatrix@{payload_hex}".encode()
    
    tx = Transaction(
        sender=sender_address,
        receiver=contract_address,
        value="0",
        gas_limit=50000000, # 50 Million gas limit
        data=tx_data,
        chain_id="T"
    )
    tx.nonce = nonce
    
    computer = TransactionComputer()
    tx.signature = signer.sign(computer.compute_bytes_for_signing(tx))
    
    tx_hash = provider.send_transaction(tx)
    if isinstance(tx_hash, bytes):
        tx_hash = tx_hash.hex()
    elif hasattr(tx_hash, 'hex'):
        tx_hash = tx_hash.hex()
    elif not isinstance(tx_hash, str):
        tx_hash = str(tx_hash)
        
    print(f"Sent tx for {mol_name}. Hash: {tx_hash}")
    return tx_hash

def wait_for_tx(tx_hash):
    print("Waiting for transaction execution...")
    for _ in range(30):
        time.sleep(2)
        try:
            status = provider.get_transaction_status(tx_hash)
            if status.is_completed:
                # Fetch full tx details to get gas used and status
                tx_details = provider.get_transaction(tx_hash)
                raw_tx = tx_details.raw
                gas_used = raw_tx.get("gasUsed", 0)
                status_str = tx_details.status.status
                
                # Check for smart contract signalError (revert)
                logs = raw_tx.get("logs", {})
                if logs:
                    events = logs.get("events", [])
                    for ev in events:
                        if ev.get("identifier") == "signalError":
                            status_str = "reverted"
                            topics = ev.get("topics", [])
                            if len(topics) > 1:
                                import base64
                                try:
                                    # Base64 decode the error message
                                    err_bytes = base64.b64decode(topics[1])
                                    status_str = f"reverted: {err_bytes.decode('utf-8')}"
                                except Exception:
                                    status_str = f"reverted: {topics[1]}"
                            break
                            
                return status_str, gas_used
        except Exception as e:
            print(f"Error querying status for {tx_hash}: {e}")
            pass
    return "Timeout", 0

def run_tests():
    # 1. Molecules to test
    molecules = ["aspirin", "benzene", "paracetamol", "fluorobenzene"]
    results = {}
    
    for name in molecules:
        data = fetch_molecule_data(name)
        if not data:
            print(f"Failed to fetch data for {name}")
            continue
            
        # Mutate the first character of the InChIKey to bypass the database check
        # and test actual fresh validation
        orig_key = data["inchikey"]
        if orig_key[0] == 'X':
            mutated_key = "Y" + orig_key[1:]
        else:
            mutated_key = "X" + orig_key[1:]
        data["inchikey"] = mutated_key
        print(f"Mutated InChIKey for new validation test: {mutated_key}")
            
        payload_hex = serialize_payload(data)
        tx_hash = send_validation_tx(name, payload_hex)
        
        status, gas_used = wait_for_tx(tx_hash)
        print(f"Result for {name}: Status = {status}, Gas Used = {gas_used}")
        results[name] = {
            "status": status,
            "gas_used": gas_used,
            "tx_hash": tx_hash,
            "inchikey": mutated_key,
            "atoms_count": len(data["atoms"])
        }
        
        # Cool down to prevent nonce conflicts
        time.sleep(5)
        
    # 2. Try to register the same molecule (benzene) again to test uniqueness
    print("\n--- Testing Uniqueness (Duplicate InChIKey Registration) ---")
    benzene_data = fetch_molecule_data("benzene")
    orig_key = benzene_data["inchikey"]
    if orig_key[0] == 'X':
        mutated_key = "Y" + orig_key[1:]
    else:
        mutated_key = "X" + orig_key[1:]
    benzene_data["inchikey"] = mutated_key
    print(f"Attempting to submit benzene a second time with duplicate key: {mutated_key}")
    
    payload_hex = serialize_payload(benzene_data)
    tx_hash_dup = send_validation_tx("benzene (duplicate)", payload_hex)
    status_dup, gas_used_dup = wait_for_tx(tx_hash_dup)
    print(f"Result for duplicate: Status = {status_dup}, Gas Used = {gas_used_dup}")
    results["benzene_duplicate"] = {
        "status": status_dup,
        "gas_used": gas_used_dup,
        "tx_hash": tx_hash_dup,
    }
    
    print("\n================== FINAL RESULTS SUMMARY ==================")
    for key, res in results.items():
        print(f"Molecule: {key}")
        print(f"  Tx Hash: {res['tx_hash']}")
        print(f"  Explorer Link: https://testnet-explorer.multiversx.com/transactions/{res['tx_hash']}")
        print(f"  Status: {res['status']}")
        if "gas_used" in res:
            print(f"  Gas Used: {res['gas_used']}")
        if "atoms_count" in res:
            print(f"  Atoms Count: {res['atoms_count']}")
        print()

if __name__ == "__main__":
    run_tests()
