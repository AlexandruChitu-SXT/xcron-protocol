import requests
import json

def fetch_molecule(name):
    print(f"Fetching {name}...")
    # Get 3D record
    url_3d = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/JSON?record_type=3d"
    r = requests.get(url_3d)
    if r.status_code != 200:
        print(f"Failed to fetch 3D record for {name}: {r.status_code}")
        return None
    data_3d = r.json()
    
    # Get InChIKey
    url_key = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/property/InChIKey/JSON"
    r = requests.get(url_key)
    inchikey = None
    if r.status_code == 200:
        key_data = r.json()
        try:
            inchikey = key_data["PropertyTable"]["Properties"][0]["InChIKey"]
        except Exception:
            pass
            
    print(f"InChIKey: {inchikey}")
    return data_3d, inchikey

if __name__ == "__main__":
    data, key = fetch_molecule("benzene")
    if data:
        # Print a small part of the structure to see the schema
        pc_compounds = data.get("PC_Compounds", [])
        if pc_compounds:
            compound = pc_compounds[0]
            # atoms
            atoms = compound.get("atoms", {})
            print("Atoms keys:", atoms.keys())
            print("AID (atom ID):", atoms.get("aid")[:5] if "aid" in atoms else None)
            print("Element:", atoms.get("element")[:5] if "element" in atoms else None)
            # coords
            coords = compound.get("coords", [])
            print("Coords length:", len(coords))
            if coords:
                coord = coords[0]
                print("Coord keys:", coord.keys())
                conformer = coord.get("conformer", [])
                if conformer:
                    print("Conformer 0 x:", conformer[0].get("x")[:5])
            # bonds
            bonds = compound.get("bonds", {})
            print("Bonds keys:", bonds.keys())
            print("Bond aid1:", bonds.get("aid1")[:5] if "aid1" in bonds else None)
            print("Bond aid2:", bonds.get("aid2")[:5] if "aid2" in bonds else None)
            print("Bond order:", bonds.get("order")[:5] if "order" in bonds else None)
