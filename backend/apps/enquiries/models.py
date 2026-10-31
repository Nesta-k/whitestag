from django.db import models
from apps.catalogue.models import Product
from apps.customers.models import CustomerAccount

class VehicleEnquiry(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    product = models.ForeignKey(
        Product,
        related_name="enquiries",
        on_delete=models.CASCADE,
        help_text="The product being enquired about."
    )
    customer = models.ForeignKey(
        CustomerAccount,
        related_name="enquiries",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The customer who made the enquiry (if logged in)."
    )
    
    # Contact Info (for both guest and logged-in users)
    name = models.CharField(max_length=255)
    email = models.EmailField()
    phone_number = models.CharField(max_length=20)
    
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Product Enquiries"

    def __str__(self):
        return f"Enquiry for {self.product.name} by {self.name}"
