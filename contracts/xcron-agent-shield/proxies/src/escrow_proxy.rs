// Code generated manually following the multiversx-sc proxy pattern.

////////////////////////////////////////////////////
////////////////// ESCROW PROXY ////////////////////
////////////////////////////////////////////////////

#![allow(dead_code)]
#![allow(clippy::all)]

use multiversx_sc::proxy_imports::*;

pub struct EscrowProxy;

impl<Env, From, To, Gas> TxProxyTrait<Env, From, To, Gas> for EscrowProxy
where
    Env: TxEnv,
    From: TxFrom<Env>,
    To: TxTo<Env>,
    Gas: TxGas<Env>,
{
    type TxProxyMethods = EscrowProxyMethods<Env, From, To, Gas>;

    fn proxy_methods(self, tx: Tx<Env, From, To, (), Gas, (), ()>) -> Self::TxProxyMethods {
        EscrowProxyMethods { wrapped_tx: tx }
    }
}

pub struct EscrowProxyMethods<Env, From, To, Gas>
where
    Env: TxEnv,
    From: TxFrom<Env>,
    To: TxTo<Env>,
    Gas: TxGas<Env>,
{
    wrapped_tx: Tx<Env, From, To, (), Gas, (), ()>,
}

#[rustfmt::skip]
impl<Env, From, Gas> EscrowProxyMethods<Env, From, (), Gas>
where
    Env: TxEnv,
    Env::Api: VMApi,
    From: TxFrom<Env>,
    Gas: TxGas<Env>,
{
    pub fn init<
        Arg0: ProxyArg<ManagedAddress<Env::Api>>,
        Arg1: ProxyArg<ManagedAddress<Env::Api>>,
    >(
        self,
        validation_contract_address: Arg0,
        identity_contract_address: Arg1,
    ) -> TxTypedDeploy<Env, From, NotPayable, Gas, ()> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_deploy()
            .argument(&validation_contract_address)
            .argument(&identity_contract_address)
            .original_result()
    }
}

#[rustfmt::skip]
impl<Env, From, To, Gas> EscrowProxyMethods<Env, From, To, Gas>
where
    Env: TxEnv,
    Env::Api: VMApi,
    From: TxFrom<Env>,
    To: TxTo<Env>,
    Gas: TxGas<Env>,
{
    pub fn upgrade(
        self,
    ) -> TxTypedUpgrade<Env, From, To, NotPayable, Gas, ()> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_upgrade()
            .original_result()
    }
}

#[rustfmt::skip]
impl<Env, From, To, Gas> EscrowProxyMethods<Env, From, To, Gas>
where
    Env: TxEnv,
    Env::Api: VMApi,
    From: TxFrom<Env>,
    To: TxTo<Env>,
    Gas: TxGas<Env>,
{
    pub fn deposit<
        Arg0: ProxyArg<ManagedBuffer<Env::Api>>,
        Arg1: ProxyArg<ManagedAddress<Env::Api>>,
        Arg2: ProxyArg<ManagedBuffer<Env::Api>>,
        Arg3: ProxyArg<u64>,
    >(
        self,
        job_id: Arg0,
        receiver: Arg1,
        poa_hash: Arg2,
        deadline: Arg3,
    ) -> TxTypedCall<Env, From, To, (), Gas, ()> {
        self.wrapped_tx
            .raw_call("deposit")
            .argument(&job_id)
            .argument(&receiver)
            .argument(&poa_hash)
            .argument(&deadline)
            .original_result()
    }

    pub fn release<
        Arg0: ProxyArg<ManagedBuffer<Env::Api>>,
    >(
        self,
        job_id: Arg0,
    ) -> TxTypedCall<Env, From, To, NotPayable, Gas, ()> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_call("release")
            .argument(&job_id)
            .original_result()
    }

    pub fn refund<
        Arg0: ProxyArg<ManagedBuffer<Env::Api>>,
    >(
        self,
        job_id: Arg0,
    ) -> TxTypedCall<Env, From, To, NotPayable, Gas, ()> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_call("refund")
            .argument(&job_id)
            .original_result()
    }

    pub fn get_escrow<
        Arg0: ProxyArg<ManagedBuffer<Env::Api>>,
    >(
        self,
        job_id: Arg0,
    ) -> TxTypedCall<Env, From, To, NotPayable, Gas, escrow::storage::EscrowData<Env::Api>> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_call("get_escrow")
            .argument(&job_id)
            .original_result()
    }

    pub fn get_validation_contract_address(
        self,
    ) -> TxTypedCall<Env, From, To, NotPayable, Gas, ManagedAddress<Env::Api>> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_call("get_validation_contract_address")
            .original_result()
    }

    pub fn get_identity_contract_address(
        self,
    ) -> TxTypedCall<Env, From, To, NotPayable, Gas, ManagedAddress<Env::Api>> {
        self.wrapped_tx
            .payment(NotPayable)
            .raw_call("get_identity_contract_address")
            .original_result()
    }
}
