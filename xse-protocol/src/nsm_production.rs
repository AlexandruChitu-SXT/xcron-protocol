//! AWS Nitro Enclaves NSM Production Integration.
//!
//! Replaces the portable stub with the real AWS Nitro Security Module (NSM) API.
//! This module interacts directly with the Nitro hypervisor to request a cryptographically
//! signed attestation document, which proves the identity (PCR0) of the enclave code.
//!
//! # Production use
//! This module only compiles and functions when running inside an actual AWS Nitro Enclave
//! EC2 instance with the `nitro-enclave` feature flag enabled. The attestation document
//! is generated using the AWS Nitro Root Certificate.

#[cfg(feature = "nitro-enclave")]
use aws_nitro_enclaves_nsm_api::{
    api::{Request, Response},
    driver::{nsm_exit, nsm_init, nsm_process_request},
};
#[cfg(feature = "nitro-enclave")]
use serde::{Deserialize, Serialize};

/// Production implementation for retrieving the real NSM attestation document.
///
/// Sends an `Attestation` request to the NSM device. The hypervisor responds with a
/// CBOR/COSE signed document containing the PCR measurements of the enclave.
#[cfg(feature = "nitro-enclave")]
pub fn get_real_nsm_attestation_document(
    user_data: Option<Vec<u8>>,
    nonce: Option<Vec<u8>>,
    public_key: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    // 1. Initialize NSM driver
    let nsm_fd = nsm_init();
    if nsm_fd < 0 {
        return Err(format!("Failed to initialize NSM driver: {}", nsm_fd));
    }

    // 2. Build the attestation request
    let request = Request::Attestation {
        user_data,
        nonce,
        public_key,
    };

    // 3. Process the request via the hypervisor
    let response = nsm_process_request(nsm_fd, request);

    // 4. Close the driver
    nsm_exit(nsm_fd);

    // 5. Handle the response
    match response {
        Response::Attestation { document } => Ok(document),
        Response::Error(err) => Err(format!("NSM API Error: {:?}", err)),
        _ => Err("Unexpected NSM response type".to_string()),
    }
}

/// Fallback for non-enclave environments (e.g. local testing).
/// Will return an error if called, ensuring production code doesn't silently mock
/// when the feature flag is missing.
#[cfg(not(feature = "nitro-enclave"))]
pub fn get_real_nsm_attestation_document(
    _user_data: Option<Vec<u8>>,
    _nonce: Option<Vec<u8>>,
    _public_key: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    Err("Cannot generate real NSM attestation: code not compiled with 'nitro-enclave' feature".to_string())
}
