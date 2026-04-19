pub use common::errors::ERR_JOB_NOT_FOUND;

pub const ERR_NOT_EMPLOYER: &str = "Only the employer can provide feedback";
pub const ERR_FEEDBACK_ALREADY_PROVIDED: &str = "Feedback already provided for this job";
pub const ERR_AGENT_OWNER_CANNOT_SELF_REVIEW: &str =
    "Agent owner cannot give feedback to own agent";
pub const ERR_INVALID_VALUE_DECIMALS: &str = "Value decimals must be 0-18";
pub const ERR_FEEDBACK_NOT_FOUND: &str = "Feedback not found";
pub const ERR_FEEDBACK_ALREADY_REVOKED: &str = "Feedback already revoked";
