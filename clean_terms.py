import os

REPLACEMENTS = {
    "AttackMode": "ExecutionMode",
    "mixed_attack": "mixed_profile",
    "Mixed attack mode": "Mixed execution mode",
    "attack or operation": "execution or operation",
    "Snipe attacks": "Snipe operations",
    "Cannot attack without weapons": "Cannot execute without funded wallets",
    "BLOCK BOUNDARY ATTACK": "BLOCK BOUNDARY EXECUTION",
    "Battle of Nodes": "Performance Benchmarks",
    "battle of nodes": "performance benchmarks",
    "Vector1Deadlock": "Scenario1Deadlock",
    "Vector2Underflow": "Scenario2Underflow",
    "Vector3MemoryBomb": "Scenario3MemoryLoad",
    "RED TEAM ATTACK": "SECURITY AUDIT",
    "RED TEAM SIMULATION": "SECURITY SIMULATION",
    "RED TEAM WIN": "VULNERABILITY FOUND",
    "ATTACK 1": "SCENARIO 1",
    "ATTACK 2": "SCENARIO 2",
    "ATTACK 3": "SCENARIO 3",
    "OptimisticRollbackBomb": "OptimisticRollbackTest",
    "StateBloat": "StateStressTest",
    "P2pFlood": "P2pStressTest",
}

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = content
        for old, new in REPLACEMENTS.items():
            new_content = new_content.replace(old, new)
            
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated: {filepath}")
    except Exception as e:
        pass

for root, dirs, files in os.walk("/Users/alejandrochitu/xcron-protocol"):
    if ".git" in root or "node_modules" in root or "target" in root or "venv" in root:
        continue
    for file in files:
        if file.endswith((".rs", ".md", ".ts", ".tsx", ".json", ".toml")):
            process_file(os.path.join(root, file))
