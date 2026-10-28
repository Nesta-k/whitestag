from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny

from .models import Brand, Category, Product, ProductImage, ProductSpecification
from .pagination import CataloguePagination
from .serializers import BrandSerializer, CategorySerializer, ProductSerializer


class CategoryListView(ListAPIView):
    queryset = Category.objects.select_related("parent").all()
    serializer_class = CategorySerializer
    pagination_class = CataloguePagination
    permission_classes = [AllowAny]


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
