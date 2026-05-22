import json
from mcp.server.fastmcp import FastMCP
from pyscf import gto, scf

# Initialize the FastMCP Server
mcp = FastMCP("XCron-PySCF-Agent")

@mcp.tool()
def simulate_molecule(atom_string: str, basis_set: str = 'sto-3g') -> str:
    """
    Simulates the electronic structure of a molecule using Hartree-Fock.
    
    Args:
        atom_string: The atomic structure string (e.g. "O 0 0 0; H 0 1 0; H 0 0 1")
        basis_set: The basis set to use (default: 'sto-3g')
        
    Returns:
        JSON string containing the total energy and dipole moment.
    """
    try:
        # Build the molecule
        mol = gto.M(atom=atom_string, basis=basis_set)
        
        # Run Hartree-Fock
        mf = scf.RHF(mol)
        energy = mf.kernel()
        
        # Run dipole moment analysis
        dipole = mf.dip_moment()
        
        result = {
            "status": "success",
            "energy_hartree": energy,
            "dipole_moment": list(dipole) if dipole is not None else [],
            "converged": mf.converged
        }
        
        return json.dumps(result)
        
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": str(e)
        })

if __name__ == "__main__":
    # Start the MCP server to listen for LLM tool calls
    print("Starting PySCF MCP Server...")
    mcp.run()
