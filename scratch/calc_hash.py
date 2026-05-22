import hashlib
from Crypto.Hash import keccak

# S
s = bytes.fromhex("0101010101010101010101010101010101010101010101010101010101010101")

# OwnerAddress (user1 padded to 32 bytes with underscores)
owner = b"user1" + b"_" * 27

# TaskId = 1 (uint64)
task_id = (1).to_bytes(8, byteorder='big')

# TargetAddress (target_contract padded to 32 bytes with underscores)
target = b"target_contract" + b"_" * 17

input_bytes = s + owner + task_id + target

# Calculate Keccak-256
k = keccak.new(digest_bits=256)
k.update(input_bytes)
print("Keccak-256 hash:", k.hexdigest())
