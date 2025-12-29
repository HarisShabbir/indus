from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class FinancialSummary(BaseModel):
  ev: Optional[float] = None
  pv: Optional[float] = None
  ac: Optional[float] = None
  spi: Optional[float] = None
  cpi: Optional[float] = None
  burn_rate: Optional[float] = Field(default=None, description="Actual cost minus earned value")
  variance_abs: Optional[float] = Field(default=None, description="Earned value minus planned value")
  variance_pct: Optional[float] = Field(default=None, description="Schedule variance percentage")
  as_of: Optional[datetime] = None


class FundAllocationRow(BaseModel):
  description: str
  amount: Optional[float] = None
  status: Optional[str] = None
  contract_id: Optional[str] = Field(default=None, alias="contractId")

  class Config:
    populate_by_name = True


class FundAllocationResponse(BaseModel):
  project: FundAllocationRow
  contracts: List[FundAllocationRow]


class ExpenseRow(BaseModel):
  description: str
  contract_code: Optional[str] = Field(default=None, alias="contractCode")
  actual: Optional[float] = None
  paid: Optional[float] = None
  balance: Optional[float] = None
  status: Optional[str] = None
  children: List["ExpenseRow"] = Field(default_factory=list)

  class Config:
    populate_by_name = True


ExpenseRow.model_rebuild()


class SankeyNode(BaseModel):
  id: str
  label: str
  type: str


class SankeyLink(BaseModel):
  source: str
  target: str
  value: float


class FundFlowResponse(BaseModel):
  nodes: List[SankeyNode]
  links: List[SankeyLink]


class IncomingFundRow(BaseModel):
  id: str
  account_name: str = Field(alias="accountName")
  funds_deposited: Optional[float] = Field(default=None, alias="fundsDeposited")
  date_of_deposit: Optional[str] = Field(default=None, alias="dateOfDeposit")

  class Config:
    populate_by_name = True


class ExpectedFundRow(BaseModel):
  id: str
  account_name: str = Field(alias="accountName")
  funds_expected: Optional[float] = Field(default=None, alias="fundsExpected")
  expected_date_of_deposit: Optional[str] = Field(default=None, alias="expectedDateOfDeposit")

  class Config:
    populate_by_name = True


class IncomingFundsResponse(BaseModel):
  available: List[IncomingFundRow]
  expected: List[ExpectedFundRow]


class OutgoingFundRow(BaseModel):
  id: str
  account_name: str = Field(alias="accountName")
  expense_value: Optional[float] = Field(default=None, alias="expenseValue")
  date_of_expense: Optional[str] = Field(default=None, alias="dateOfExpense")

  class Config:
    populate_by_name = True


class ExpectedOutgoingFundRow(BaseModel):
  id: str
  account_name: str = Field(alias="accountName")
  expected_expense_value: Optional[float] = Field(default=None, alias="expectedExpenseValue")
  expected_date_of_expense: Optional[str] = Field(default=None, alias="expectedDateOfExpense")

  class Config:
    populate_by_name = True


class OutgoingFundsResponse(BaseModel):
  actual: List[OutgoingFundRow]
  expected: List[ExpectedOutgoingFundRow]
