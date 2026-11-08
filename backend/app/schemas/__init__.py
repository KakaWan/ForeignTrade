from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyRead, CompanyList
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeRead, EmployeeList, EmailBrief
from app.schemas.email import (
    EmailDeduceRequest, EmailDeduceResult, EmailVerifyRequest, EmailVerifyResult,
    EmailCreate, EmailUpdate, EmailRead,
)
from app.schemas.dev_letter import DevLetterGenerate, DevLetterCreate, DevLetterUpdate, DevLetterRead
from app.schemas.common import (
    TagCreate, TagRead, CategoryCreate, CategoryRead,
    FollowUpCreate, FollowUpUpdate, FollowUpRead,
    EmailPatternCreate, EmailPatternRead,
    PaginatedResponse, MessageResponse, DedupResult,
)
