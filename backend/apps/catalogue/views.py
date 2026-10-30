from pathlib import Path
from uuid import uuid4

from django.core.files.storage import default_storage
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveAPIView,
    RetrieveUpdateAPIView,
)
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from .image_urls import public_image_url
from .media_service import upload_media_batch, upload_media_file
from .models import (
    Brand,
    Category,
    HomepageSettings,
    Product,
    ProductImage,
    ProductSpecification,
    Promotion,
)
from .pagination import CataloguePagination
from .serializers import (
    AdminBrandSerializer,
    AdminCategorySerializer,
    AdminProductSerializer,
    BrandSerializer,
    CategorySerializer,
    HomepageSettingsSerializer,
    ProductSerializer,
    PromotionSerializer,
    active_promotion_queryset,
)


class CategoryListView(ListAPIView):
    serializer_class = CategorySerializer
    pagination_class = CataloguePagination
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = Category.objects.select_related("parent").all()
        product_type = self.request.query_params.get("product_type")
        if product_type:
            queryset = queryset.filter(product_type=product_type)
        return queryset


class BrandListView(ListAPIView):
    queryset = (
        Brand.objects.filter(
            products__publication_status=Product.PublicationStatus.PUBLISHED
        )
        .distinct()
        .order_by("name", "pk")
    )
    serializer_class = BrandSerializer
    pagination_class = CataloguePagination
    permission_classes = [AllowAny]


class PublishedProductQuerySetMixin:
    pagination_class = CataloguePagination

    def get_queryset(self):
        queryset = Product.objects.filter(
            publication_status=Product.PublicationStatus.PUBLISHED
        ).select_related("category", "brand")
        queryset = queryset.prefetch_related(
            Prefetch("images", queryset=ProductImage.objects.order_by("display_order", "pk")),
            Prefetch(
                "specifications",
                queryset=ProductSpecification.objects.order_by("name", "pk"),
            ),
        )

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(description__icontains=search)
            )

        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category__slug=category)

        brand = self.request.query_params.get("brand")
        if brand:
            queryset = queryset.filter(brand__slug=brand)

        product_type = self.request.query_params.get("product_type")
        if product_type:
            queryset = queryset.filter(product_type=product_type)

        sales_method = self.request.query_params.get("sales_method")
        if sales_method:
            queryset = queryset.filter(sales_method=sales_method)

        return queryset


class ProductListView(PublishedProductQuerySetMixin, ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]


class ProductDetailView(RetrieveAPIView):
    serializer_class = ProductSerializer
    lookup_field = "slug"
    permission_classes = [AllowAny]

    def get_queryset(self):
        return (
            Product.objects.filter(
                publication_status=Product.PublicationStatus.PUBLISHED
            )
            .select_related("category", "brand")
            .prefetch_related("images", "specifications")
        )

    def get_object(self):
        return get_object_or_404(self.get_queryset(), slug=self.kwargs["slug"])


class StaffProductListCreateView(ListCreateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminProductSerializer
    pagination_class = CataloguePagination
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = Product.objects.select_related("category", "brand").prefetch_related(
            "images",
            "specifications",
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(sku__icontains=search)
                | Q(slug__icontains=search)
            )
        for field in ("publication_status", "product_type", "sales_method"):
            value = self.request.query_params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})
        return queryset


class StaffProductDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminProductSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Product.objects.select_related("category", "brand").prefetch_related(
        "images",
        "specifications",
    )
    lookup_field = "pk"


class StaffCategoryListCreateView(ListCreateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminCategorySerializer
    pagination_class = CataloguePagination
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = Category.objects.select_related("parent").all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(description__icontains=search)
            )
        product_type = self.request.query_params.get("product_type")
        if product_type:
            queryset = queryset.filter(product_type=product_type)
        return queryset


class StaffCategoryDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminCategorySerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Category.objects.select_related("parent").all()


class StaffBrandListCreateView(ListCreateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminBrandSerializer
    pagination_class = CataloguePagination
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = Brand.objects.all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(slug__icontains=search)
                | Q(description__icontains=search)
            )
        return queryset


class StaffBrandDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminBrandSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Brand.objects.all()


class StaffMediaUploadView(APIView):
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        folder = request.data.get("folder", "catalogue")
        if not isinstance(folder, str) or not folder.replace("-", "").replace("_", "").isalnum():
            folder = "catalogue"

        # Check for multiple files under 'files' or multiple 'file' keys
        files = request.FILES.getlist("files")
        if not files and len(request.FILES.getlist("file")) > 1:
            files = request.FILES.getlist("file")

        if files:
            results = upload_media_batch(files, folder=folder, request=request)
            return Response(
                {
                    "count": len(results),
                    "images": results,
                    "url": results[0]["url"] if results else "",
                }
            )

        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "An image file is required."})

        result = upload_media_file(upload, folder=folder, request=request)
        return Response(result)


class PromotionListView(ListAPIView):
    serializer_class = PromotionSerializer
    pagination_class = CataloguePagination
    permission_classes = [AllowAny]

    def get_queryset(self):
        return active_promotion_queryset()


class StaffPromotionListCreateView(ListCreateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = PromotionSerializer
    pagination_class = CataloguePagination
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Promotion.objects.all()

    def get_queryset(self):
        queryset = Promotion.objects.all()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(slug__icontains=search)
            )
        return queryset


class StaffPromotionDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = PromotionSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Promotion.objects.all()


class HomepagePublicView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        settings_obj = HomepageSettings.objects.filter(pk=1).first()
        if settings_obj is None:
            settings_obj = HomepageSettings()
        featured_categories = Category.objects.filter(is_featured=True).order_by(
            "featured_order",
            "name",
            "pk",
        )
        if not featured_categories.exists():
            featured_categories = Category.objects.select_related("parent").order_by(
                "name",
                "pk",
            )
        else:
            featured_categories = featured_categories.select_related("parent")

        featured_products = (
            Product.objects.filter(
                publication_status=Product.PublicationStatus.PUBLISHED,
                is_featured=True,
            )
            .select_related("category", "brand")
            .prefetch_related(
                Prefetch(
                    "images",
                    queryset=ProductImage.objects.order_by("display_order", "pk"),
                ),
                Prefetch(
                    "specifications",
                    queryset=ProductSpecification.objects.order_by("name", "pk"),
                ),
            )
            .order_by("featured_order", "name", "pk")
        )
        if not featured_products.exists():
            featured_products = (
                Product.objects.filter(
                    publication_status=Product.PublicationStatus.PUBLISHED,
                    product_type=Product.ProductType.SPARE_PART,
                    sales_method=Product.SalesMethod.DIRECT_PURCHASE,
                )
                .select_related("category", "brand")
                .prefetch_related(
                    Prefetch(
                        "images",
                        queryset=ProductImage.objects.order_by("display_order", "pk"),
                    ),
                    Prefetch(
                        "specifications",
                        queryset=ProductSpecification.objects.order_by("name", "pk"),
                    ),
                )
                .order_by("name", "pk")[:8]
            )

        brands = (
            Brand.objects.filter(
                products__publication_status=Product.PublicationStatus.PUBLISHED
            )
            .distinct()
            .order_by("name", "pk")[:12]
        )
        promotions = active_promotion_queryset()[:12]
        return Response(
            {
                "settings": HomepageSettingsSerializer(
                    settings_obj,
                    context={"request": request},
                ).data,
                "featured_categories": CategorySerializer(
                    featured_categories,
                    many=True,
                    context={"request": request},
                ).data,
                "featured_products": ProductSerializer(
                    featured_products,
                    many=True,
                    context={"request": request},
                ).data,
                "promotions": PromotionSerializer(
                    promotions,
                    many=True,
                    context={"request": request},
                ).data,
                "brands": BrandSerializer(brands, many=True).data,
            }
        )


class StaffHomepageSettingsView(RetrieveUpdateAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = HomepageSettingsSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return HomepageSettings.load()
