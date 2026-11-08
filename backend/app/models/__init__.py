"""ORM models package — import all models so Alembic and metadata can see them."""

from app.models.company import Company
from app.models.employee import Employee
from app.models.email import Email
from app.models.dev_letter import DevLetter
from app.models.letter_template import LetterTemplate
from app.models.sender_profile import SenderProfile
from app.models.tag import Tag, Category, EntityTag, EntityCategory
from app.models.follow_up import FollowUp
from app.models.email_pattern import EmailPattern
from app.models.import_record import ImportRecord
from app.models.product import Product, CompanyProduct

__all__ = [
    "Company",
    "Employee",
    "Email",
    "DevLetter",
    "LetterTemplate",
    "SenderProfile",
    "Tag",
    "Category",
    "EntityTag",
    "EntityCategory",
    "FollowUp",
    "EmailPattern",
    "ImportRecord",
    "Product",
    "CompanyProduct",
]
