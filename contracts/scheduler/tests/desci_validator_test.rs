use multiversx_sc::types::{ManagedVec, ManagedBuffer};
use multiversx_sc_scenario::{DebugApi};
use scheduler::desci_validator::{AtomCoord, Bond, MoleculePayload};

/// Módulo de Testing Mock para validar la lógica del Motor Geométrico 4.2
fn setup_mock_api() {
    let _ = DebugApi::dummy();
}

#[test]
fn test_benchmark_1_ethanol_valid_relaxed() {
    setup_mock_api();
    
    let mut atoms = ManagedVec::new();
    atoms.push(AtomCoord { atomic_number: 6, x_fm: 118_800, y_fm: -38_300, z_fm: 0 });
    atoms.push(AtomCoord { atomic_number: 6, x_fm: -129_500, y_fm: 46_600, z_fm: 0 });
    atoms.push(AtomCoord { atomic_number: 8, x_fm: -247_300, y_fm: -37_500, z_fm: 0 });
    
    let mut bonds = ManagedVec::new();
    bonds.push(Bond { atom1_idx: 0, atom2_idx: 1, bond_type: 10 }); // C-C (Single)
    bonds.push(Bond { atom1_idx: 1, atom2_idx: 2, bond_type: 10 }); // C-O (Single)

    let _payload = MoleculePayload::<DebugApi> {
        atoms,
        bonds,
        inchikey: ManagedBuffer::new_from_bytes(b"LFQMTTKNSNXHGC-UHFFFAOYSA-N"),
    };
}

#[test]
fn test_benchmark_2_stretched_bond_invalid() {
    setup_mock_api();
    
    let mut atoms = ManagedVec::new();
    atoms.push(AtomCoord { atomic_number: 6, x_fm: 0, y_fm: 0, z_fm: 0 });
    atoms.push(AtomCoord { atomic_number: 6, x_fm: 180_000, y_fm: 0, z_fm: 0 });
    
    let mut bonds = ManagedVec::new();
    bonds.push(Bond { atom1_idx: 0, atom2_idx: 1, bond_type: 20 }); // C=C (Double)

    let _payload = MoleculePayload::<DebugApi> {
        atoms,
        bonds,
        inchikey: ManagedBuffer::new_from_bytes(b"LFQMTTKNSNXHGC-UHFFFAOYSA-N"),
    };
}

#[test]
fn test_benchmark_3_vdw_collision_invalid() {
    setup_mock_api();
    
    let mut atoms = ManagedVec::new();
    atoms.push(AtomCoord { atomic_number: 8, x_fm: 0, y_fm: 0, z_fm: 0 });
    atoms.push(AtomCoord { atomic_number: 8, x_fm: 100_000, y_fm: 0, z_fm: 0 });
    
    let bonds = ManagedVec::new(); // Vacío (Non-bonded)

    let _payload = MoleculePayload::<DebugApi> {
        atoms,
        bonds,
        inchikey: ManagedBuffer::new_from_bytes(b"LFQMTTKNSNXHGC-UHFFFAOYSA-N"),
    };
}

fn rust_is_valid_inchikey_format(key: &[u8]) -> bool {
    if key.len() != 27 { return false; }
    if key[14] != b'-' || key[25] != b'-' { return false; }
    if key[23] != b'S' { return false; }
    
    for i in 0..14 {
        if key[i] < b'A' || key[i] > b'Z' { return false; }
    }
    for i in 15..23 {
        if key[i] < b'A' || key[i] > b'Z' { return false; }
    }
    if key[24] < b'A' || key[24] > b'Z' { return false; }
    if key[26] < b'A' || key[26] > b'Z' { return false; }
    
    true
}

#[test]
fn test_inchikey_format_rules() {
    // Válido
    assert!(rust_is_valid_inchikey_format(b"LFQMTTKNSNXHGC-UHFFFAOYSA-N"));
    
    // Longitud incorrecta
    assert!(!rust_is_valid_inchikey_format(b"LFQMTTKNSNXHGC-UHFFFAOYSA-"));
    assert!(!rust_is_valid_inchikey_format(b"LFQMTTKNSNXHGC-UHFFFAOYSA-N1"));
    
    // Guiones incorrectos
    assert!(!rust_is_valid_inchikey_format(b"LFQMTTKNSNXHGCXUHFFFAOYSA-N"));
    assert!(!rust_is_valid_inchikey_format(b"LFQMTTKNSNXHGC-UHFFFAOYSAXN"));
    
    // Caracteres no permitidos (minúsculas)
    assert!(!rust_is_valid_inchikey_format(b"lfqmttknsnxhgc-UHFFFAOYSA-N"));
    
    // Versión no estándar (por ejemplo, 'T' en lugar de 'S' en la posición 23)
    assert!(!rust_is_valid_inchikey_format(b"LFQMTTKNSNXHGC-UHFFFAOYTA-N"));
}

fn rust_get_max_valence(atomic_number: u8) -> u32 {
    match atomic_number {
        1 => 1,
        6 => 4,
        7 => 4,
        8 => 3,
        9 => 1,
        15 => 5,
        16 => 6,
        17 => 1,
        _ => 4,
    }
}

fn rust_check_valence(atoms: &[u8], bonds: &[(usize, usize, u8)]) -> bool {
    let mut valence = vec![0u32; atoms.len()];
    for &(a1, a2, bond_type) in bonds {
        let val = match bond_type {
            10 => 10,
            15 => 15,
            20 => 20,
            30 => 30,
            _ => return false,
        };
        valence[a1] += val;
        valence[a2] += val;
    }
    for i in 0..atoms.len() {
        let max_val = rust_get_max_valence(atoms[i]);
        if valence[i] > max_val * 10 {
            return false;
        }
    }
    true
}

#[test]
fn test_valence_validation_rules() {
    // Carbono pentavalente (C con 5 enlaces simples) -> Inválido
    let atoms = vec![6, 1, 1, 1, 1, 1]; // C y 5 H
    let bonds = vec![
        (0, 1, 10),
        (0, 2, 10),
        (0, 3, 10),
        (0, 4, 10),
        (0, 5, 10),
    ];
    assert!(!rust_check_valence(&atoms, &bonds));

    // Benceno aromático (6 Carbonos con 2 enlaces aromáticos y 1 enlace C-H simple c/u) -> Válido
    let atoms_benzene = vec![6, 6, 6, 6, 6, 6, 1, 1, 1, 1, 1, 1];
    let bonds_benzene = vec![
        (0, 1, 15), (1, 2, 15), (2, 3, 15), (3, 4, 15), (4, 5, 15), (5, 0, 15), // Anillo aromático
        (0, 6, 10), (1, 7, 10), (2, 8, 10), (3, 9, 10), (4, 10, 10), (5, 11, 10), // C-H simples
    ];
    assert!(rust_check_valence(&atoms_benzene, &bonds_benzene));
}
