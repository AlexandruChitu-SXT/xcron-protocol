multiversx_sc::imports!();
multiversx_sc::derive_imports!();

use common::lns::{from_lns, to_lns};

/// Limites de Van der Waals en femtómetros (1 pm = 1000 fm)
pub const VDW_CARBON: u64 = 170_000;
pub const VDW_HYDROGEN: u64 = 120_000;
pub const VDW_OXYGEN: u64 = 152_000;
pub const VDW_NITROGEN: u64 = 155_000;
pub const VDW_FLUORINE: u64 = 147_000;
pub const VDW_CHLORINE: u64 = 175_000;
pub const VDW_SULFUR: u64 = 180_000;
pub const VDW_PHOSPHORUS: u64 = 180_000;

pub const MAX_ATOMS: usize = 100;
pub const ADJ_MATRIX_SIZE: usize = 10000;
pub const BOND_TOLERANCE_LOWER: u64 = 85;
pub const BOND_TOLERANCE_UPPER: u64 = 115;
pub const VDW_TOLERANCE: u64 = 75;

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, ManagedVecItem, Clone)]
pub struct AtomCoord {
    pub atomic_number: u8,
    pub x_fm: i64,
    pub y_fm: i64,
    pub z_fm: i64,
}

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, ManagedVecItem, Clone, PartialEq)]
pub struct Bond {
    pub atom1_idx: u32,
    pub atom2_idx: u32,
    pub bond_type: u8, // 10: single, 15: aromatic, 20: double, 30: triple
}

#[type_abi]
#[derive(TopEncode, TopDecode, NestedEncode, NestedDecode, Clone)]
pub struct MoleculePayload<M: ManagedTypeApi> {
    pub atoms: ManagedVec<M, AtomCoord>,
    pub bonds: ManagedVec<M, Bond>,
    pub inchikey: ManagedBuffer<M>,
}

#[multiversx_sc::module]
pub trait DesciValidatorModule {

    fn get_vdw_radius(&self, atomic_number: u8) -> u64 {
        match atomic_number {
            1 => VDW_HYDROGEN,
            6 => VDW_CARBON,
            7 => VDW_NITROGEN,
            8 => VDW_OXYGEN,
            9 => VDW_FLUORINE,
            15 => VDW_PHOSPHORUS,
            16 => VDW_SULFUR,
            17 => VDW_CHLORINE,
            _ => 200_000,
        }
    }

    fn get_covalent_radius(&self, atomic_number: u8) -> u64 {
        match atomic_number {
            1 => 37_000,   // H
            6 => 77_000,   // C
            7 => 75_000,   // N
            8 => 73_000,   // O
            9 => 71_000,   // F
            15 => 106_000, // P
            16 => 102_000, // S
            17 => 99_000,  // Cl
            _ => 100_000,  // Fallback genérico (1.0 Å)
        }
    }

    fn get_max_valence(&self, atomic_number: u8) -> u32 {
        match atomic_number {
            1 => 1,   // H
            6 => 4,   // C
            7 => 4,   // N (sales amonio, aminas, nitro)
            8 => 3,   // O (alcoholes, éteres, carbonilos, oxonios)
            9 => 1,   // F
            15 => 5,  // P (fosfatos, fosfinas)
            16 => 6,  // S (sulfonas, sulfatos)
            17 => 1,  // Cl
            _ => 4,   // Fallback genérico
        }
    }

    /// Tabla de Geometría Covalente Estricta
    /// Devuelve la distancia ideal del enlace en femtómetros.
    fn get_ideal_bond_distance(&self, atomic_a: u8, atomic_b: u8, bond_type: u8) -> u64 {
        let (min_atom, max_atom) = if atomic_a < atomic_b {
            (atomic_a, atomic_b)
        } else {
            (atomic_b, atomic_a)
        };

        let known_dist = match (min_atom, max_atom, bond_type) {
            // C - C
            (6, 6, 10) => 154_000, // Single
            (6, 6, 15) => 140_000, // Aromatic
            (6, 6, 20) => 134_000, // Double
            (6, 6, 30) => 120_000, // Triple
            // C - H
            (1, 6, 10) => 109_000, // Single
            // C - O
            (6, 8, 10) => 143_000, // Single
            (6, 8, 15) => 131_000, // Aromatic (approx)
            (6, 8, 20) => 120_000, // Double
            // C - N
            (6, 7, 10) => 147_000, // Single
            (6, 7, 15) => 134_000, // Aromatic
            (6, 7, 20) => 128_000, // Double
            (6, 7, 30) => 116_000, // Triple
            // N - H
            (1, 7, 10) => 101_000, // Single
            // O - H
            (1, 8, 10) => 96_000,  // Single
            // N - O
            (7, 8, 10) => 140_000, // Single
            (7, 8, 20) => 121_000, // Double
            _ => 0,
        };

        if known_dist > 0 {
            return known_dist;
        }

        // Fallback dinámico usando radios covalentes: (radio_a + radio_b) * factor_orden
        let radius_a = self.get_covalent_radius(atomic_a);
        let radius_b = self.get_covalent_radius(atomic_b);
        let sum_radios = radius_a + radius_b;

        match bond_type {
            10 => sum_radios,
            15 => (sum_radios * 90) / 100, // Aromático (~90%)
            20 => (sum_radios * 87) / 100, // Doble (~87%)
            30 => (sum_radios * 78) / 100, // Triple (~78%)
            _ => sum_radios,
        }
    }

    /// Calcula la distancia 3D euclidiana en femtómetros.
    /// Usa matemática entera nativa u64 para sumar los cuadrados (100% exacto, zero gas waste)
    /// y reserva el uso de LNS únicamente para extraer la raíz cuadrada.
    #[view(calculateDistance3D)]
    fn calculate_distance_3d(&self, a: &AtomCoord, b: &AtomCoord) -> u64 {
        let dx = a.x_fm.abs_diff(b.x_fm);
        let dy = a.y_fm.abs_diff(b.y_fm);
        let dz = a.z_fm.abs_diff(b.z_fm);

        // Saturation check preventivo: 2,000,000,000 fm = 2,000,000 pm (2 µm).
        // Evita overflow al calcular dx * dx. Como dx < 2^31, dx * dx < 2^62,
        // lo cual cabe de sobra en un u64 sin hacer overflow (u64::MAX ~ 1.8e19).
        require!(
            dx < 2_000_000_000 && dy < 2_000_000_000 && dz < 2_000_000_000,
            "Molecule too large, math overflow protection"
        );

        let sum_sq = (dx * dx) + (dy * dy) + (dz * dz);
        if sum_sq == 0 { return 0; }

        let lns_sum_sq = to_lns(sum_sq);
        let dist_lns = lns_sum_sq >> 1;
        
        from_lns(dist_lns)
    }

    fn is_valid_inchikey_format(&self, key: &ManagedBuffer) -> bool {
        if key.len() != 27 { return false; }
        
        let mut buf = [0u8; 27];
        let _ = key.load_to_byte_array(&mut buf);
        
        // Formato estándar: AAAAAAAAAAAAAA-BBBBBBBBBB-C
        // Guiones en posiciones 14 y 25 (0-indexed)
        if buf[14] != b'-' || buf[25] != b'-' { return false; }
        
        // Penúltimo carácter del segundo bloque (posición 23) indica la versión (S = Estándar)
        if buf[23] != b'S' { return false; }
        
        // Bloque 1 (0-13): 14 letras mayúsculas
        for i in 0..14 {
            if buf[i] < b'A' || buf[i] > b'Z' { return false; }
        }
        
        // Bloque 2 (15-22 y 24): Letras mayúsculas (estereoquímica y protonación)
        for i in 15..23 {
            if buf[i] < b'A' || buf[i] > b'Z' { return false; }
        }
        if buf[24] < b'A' || buf[24] > b'Z' { return false; }
        
        // Bloque 3 (26): Última letra
        if buf[26] < b'A' || buf[26] > b'Z' { return false; }
        
        true
    }

    #[storage_mapper("registered_inchikeys")]
    fn registered_inchikeys(&self) -> SetMapper<ManagedByteArray<Self::Api, 32>>;

    /// Valida el MoleculePayload asegurando que los enlaces cumplan ±15% y los no enlazados no colisionen.
    #[endpoint(validatePhysicalMatrix)]
    fn validate_physical_matrix(&self, payload: MoleculePayload<Self::Api>) {
        let inchikey = payload.inchikey;
        require!(self.is_valid_inchikey_format(&inchikey), "Invalid InChIKey format");
        
        let key_hash = self.crypto().sha256(&inchikey);
        let mut inchikeys_set = self.registered_inchikeys();
        require!(!inchikeys_set.contains(&key_hash), "Molecule already registered");
        let _ = inchikeys_set.insert(key_hash);

        let atoms = payload.atoms;
        let bonds = payload.bonds;
        
        let len = atoms.len();
        
        // Limite estricto de tamaño para evitar desbordamiento de gas y de pila
        require!(len > 0 && len <= MAX_ATOMS, "Molecule too large for on-chain validation (max 100 atoms)");

        // Matriz de adyacencia plana (Flat Array) en la Pila (Stack) para Lookup O(1)
        let mut adj_matrix = [0u8; ADJ_MATRIX_SIZE];
        let mut atom_bond_count = [0u8; MAX_ATOMS]; // Tracker para evitar átomos huérfanos
        let mut atom_valence_sum = [0u32; MAX_ATOMS]; // Tracker de valencia acumulada (x10)

        for bond in bonds.iter() {
            let a1 = bond.atom1_idx as usize;
            let a2 = bond.atom2_idx as usize;
            
            require!(a1 < len && a2 < len, "Bond index out of bounds");
            require!(a1 != a2, "Self-bonds are not allowed");
            
            let val = match bond.bond_type {
                10 => 10, // Simple
                15 => 15, // Aromático
                20 => 20, // Doble
                30 => 30, // Triple
                _ => sc_panic!("Unknown bond type"),
            };
            
            let idx1 = a1 * MAX_ATOMS + a2;
            let idx2 = a2 * MAX_ATOMS + a1;
            
            require!(adj_matrix[idx1] == 0, "Duplicate bond detected");
            
            adj_matrix[idx1] = bond.bond_type;
            adj_matrix[idx2] = bond.bond_type;
            
            atom_bond_count[a1] += 1;
            atom_bond_count[a2] += 1;
            
            atom_valence_sum[a1] += val;
            atom_valence_sum[a2] += val;
        }
        
        // Validación de Conectividad Molecular y Valencias Electrónicas
        for i in 0..len {
            require!(atom_bond_count[i] > 0, "Isolated atom detected (fragmented molecule)");
            
            let atomic_number = atoms.get(i).atomic_number;
            let max_val = self.get_max_valence(atomic_number);
            
            require!(
                atom_valence_sum[i] <= max_val * 10,
                "Valence limit exceeded"
            );
        }

        for i in 0..len {
            let atom_a = atoms.get(i);
            let radius_a = self.get_vdw_radius(atom_a.atomic_number);

            for j in (i + 1)..len {
                let atom_b = atoms.get(j);
                let radius_b = self.get_vdw_radius(atom_b.atomic_number);

                let distance = self.calculate_distance_3d(&atom_a, &atom_b);
                
                // Lookup O(1) ultra rápido en matriz de adyacencia
                let current_bond_type = adj_matrix[i * MAX_ATOMS + j];

                if current_bond_type > 0 {
                    // Geometría Covalente (Bonded / 1-2)
                    let ideal_dist = self.get_ideal_bond_distance(atom_a.atomic_number, atom_b.atomic_number, current_bond_type);
                    
                    let lower_bound = (ideal_dist * BOND_TOLERANCE_LOWER) / 100u64;
                    let upper_bound = (ideal_dist * BOND_TOLERANCE_UPPER) / 100u64;

                    require!(
                        distance >= lower_bound && distance <= upper_bound,
                        "Covalent bond distance is highly deformed (out of tolerance)"
                    );
                } else {
                    // Exclusión de interacciones 1-3 (comparten vecino común)
                    let mut share_neighbor = false;
                    for k in 0..len {
                        if adj_matrix[i * MAX_ATOMS + k] > 0 && adj_matrix[j * MAX_ATOMS + k] > 0 {
                            share_neighbor = true;
                            break;
                        }
                    }

                    if !share_neighbor {
                        // Fuerzas Intermoleculares (Non-Bonded / 1-4 o superior)
                        let min_allowed_dist = ((radius_a + radius_b) * VDW_TOLERANCE) / 100u64;
                        require!(
                            distance >= min_allowed_dist,
                            "Atomic overlap detected (Van der Waals violation)"
                        );
                    }
                }
            }
        }
    }
}
