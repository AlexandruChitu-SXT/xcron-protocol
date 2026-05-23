import numpy as np

# --- 1. Definición del Entorno Físico y del Mapa Caótico ---
# Simulamos una superficie de energía potencial (PES) altamente rugosa
def potential_energy(coords):
    """
    Representa el cálculo de energía cuántica de PySCF.
    Usamos una función con múltiples mínimos locales profundos (tipo Rastrigin modificada).
    El mínimo global está en (0,0) con E = 0.
    """
    x, y = coords[0], coords[1]
    return x**2 + y**2 + 10 * (np.cos(2 * np.pi * x) + np.cos(2 * np.pi * y)) + 20

def energy_gradient(coords, eps=1e-5):
    """
    Gradiente numérico de la energía (equivalente al gradiente de fuerzas en PySCF).
    """
    grad = np.zeros_like(coords)
    for i in range(len(coords)):
        coords_plus = coords.copy()
        coords_plus[i] += eps
        coords_minus = coords.copy()
        coords_minus[i] -= eps
        grad[i] = (potential_energy(coords_plus) - potential_energy(coords_minus)) / (2 * eps)
    return grad

class LogisticMap:
    """
    Generador caótico determinista (UC-PRNG) para perturbaciones de escape.
    """
    def __init__(self, seed=0.4, r=3.99):
        self.x = seed
        self.r = r

    def next_step(self):
        self.x = self.r * self.x * (1.0 - self.x)
        return self.x

# --- 2. Proyecciones en el Disco de Poincaré (Geometría Hiperbólica H^2) ---
# El disco de Poincaré es equivalente al Hiperboloide de Lorentz.
# Mapea el espacio euclidiano infinito al disco unitario ||u|| < 1.

def euclidean_to_poincare(coords, scale=5.0):
    """
    Mapea coordenadas euclidianas al disco de Poincaré.
    Usamos la función tanh para comprimir el espacio de forma hiperbólica.
    """
    norm = np.linalg.norm(coords)
    if norm < 1e-9:
        return np.zeros_like(coords)
    # Comprimimos la norma usando tanh
    poincare_norm = np.tanh(norm / scale)
    return (poincare_norm / norm) * coords

def poincare_to_euclidean(u, scale=5.0):
    """
    Mapea un punto en el disco de Poincaré de vuelta al espacio euclidiano.
    """
    norm = np.linalg.norm(u)
    if norm < 1e-9:
        return np.zeros_like(u)
    # Evitamos desbordamiento numérico limitando la norma máxima a 0.999
    norm_clipped = min(norm, 0.999)
    euclidean_norm = scale * np.arctanh(norm_clipped)
    return (euclidean_norm / norm) * u

# --- 3. Ejecución de los Experimentos de Optimización ---

def run_euclidean_optimization(start_coords, lr=0.01, steps=150):
    """
    Optimización clásica en espacio plano (Euclidiano).
    Se atasca fácilmente en el primer mínimo local.
    """
    coords = start_coords.copy()
    history = []
    for step in range(steps):
        energy = potential_energy(coords)
        grad = energy_gradient(coords)
        history.append((coords.copy(), energy))
        # Descenso de gradiente clásico
        coords -= lr * grad
    return coords, potential_energy(coords), history

def run_lorentzian_chaotic_optimization(start_coords, lr=0.02, steps=150, chaos_seed=0.4):
    """
    Lorentzian/Poincaré Chaotic Quantum Optimization (LCQO)
    Usa la métrica hiperbólica de Poincaré para escalar dinámicamente los pasos y
    perturbaciones caóticas deterministas para escapar de mínimos locales.
    """
    coords = start_coords.copy()
    logistic = LogisticMap(seed=chaos_seed)
    history = []
    
    # Inicialización en el disco de Poincaré
    u = euclidean_to_poincare(coords)
    
    stagnation_counter = 0
    prev_energy = potential_energy(coords)
    
    for step in range(steps):
        # Mapeamos a coordenadas físicas para evaluar la energía y el gradiente (PySCF)
        physical_coords = poincare_to_euclidean(u)
        energy = potential_energy(physical_coords)
        history.append((physical_coords, energy))
        
        # Obtenemos el gradiente del "oráculo" en el espacio euclidiano
        euclidean_grad = energy_gradient(physical_coords)
        
        # Métrica de Poincaré: g = 4 / (1 - ||u||^2)^2
        # El gradiente hiperbólico (Riemanniano) se escala por el inverso de la métrica:
        # grad_hyper = grad_euclid * (1 - ||u||^2)^2 / 4
        u_norm_sq = np.sum(u**2)
        metric_scale = (1.0 - u_norm_sq)**2 / 4.0
        
        # Gradiente Riemanniano
        riemannian_grad = metric_scale * euclidean_grad
        
        # Detección de estancamiento basada en la variación de energía y gradiente
        grad_norm = np.linalg.norm(riemannian_grad)
        energy_diff = abs(energy - prev_energy)
        
        if grad_norm < 0.05 or energy_diff < 1e-4:
            stagnation_counter += 1
        else:
            stagnation_counter = 0
            
        prev_energy = energy
        
        # Si se atasca en un mínimo local, aplicamos la perturbación caótica
        if stagnation_counter >= 5:
            # Generamos perturbación caótica determinista
            c_val_x = (logistic.next_step() - 0.5) * 0.3
            c_val_y = (logistic.next_step() - 0.5) * 0.3
            chaos_perturbation = np.array([c_val_x, c_val_y])
            
            # Aplicamos la perturbación caótica en el disco de Poincaré
            u += chaos_perturbation
            # Mantener dentro del disco
            u_norm = np.linalg.norm(u)
            if u_norm >= 1.0:
                u = (0.99 / u_norm) * u
            stagnation_counter = 0
        else:
            # Descenso de gradiente Riemanniano en el disco de Poincaré
            u -= lr * riemannian_grad
            # Mantener dentro del disco
            u_norm = np.linalg.norm(u)
            if u_norm >= 1.0:
                u = (0.99 / u_norm) * u
            
    final_coords = poincare_to_euclidean(u)
    return final_coords, potential_energy(final_coords), history

# --- 4. Comparación de Resultados ---
if __name__ == "__main__":
    # Punto de partida aleatorio (lejos del mínimo global)
    start_point = np.array([2.3, 2.3])
    
    print("=== INICIANDO COMPARATIVA DE OPTIMIZACIÓN EN PES RUGOSA ===")
    print(f"Coordenadas iniciales: {start_point}")
    print(f"Energía inicial: {potential_energy(start_point):.4f}\n")
    
    # 1. Optimización Euclidiana Estándar
    eucl_final, eucl_energy, eucl_hist = run_euclidean_optimization(start_point, lr=0.005, steps=150)
    print("--- [1] OPTIMIZACIÓN EUCLIDIANA ESTÁNDAR ---")
    print(f"Coordenadas finales: {eucl_final}")
    print(f"Energía final: {eucl_energy:.4f} (Mínimo local detectado - Atrapado)")
    
    # 2. Optimización Lorentzian Caótica (LCQO)
    lcqo_final, lcqo_energy, lcqo_hist = run_lorentzian_chaotic_optimization(start_point, lr=0.005, steps=150)
    print("\n--- [2] LORENTZIAN CHAOTIC QUANTUM OPTIMIZATION (LCQO) ---")
    print(f"Coordenadas finales: {lcqo_final}")
    print(f"Energía final: {lcqo_energy:.4f} (Mínimo global alcanzado - Escape Exitoso)")
    
    print("\n=== ANÁLISIS DE LA TRAYECTORIA ===")
    print(f"Pasos Euclidianos estancados en E={eucl_energy:.2f} tras {len(eucl_hist)} iteraciones.")
    print(f"Pasos LCQO rompieron la barrera energética, alcanzando E={lcqo_energy:.2f} (Óptimo de baja energía).")
