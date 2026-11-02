export interface PageRequest {
    page: number;
    pageSize: number;
}

export interface PageResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export function toSkipTake({ page, pageSize }: PageRequest) {
    return { skip: (page - 1) * pageSize, take: pageSize };
}

export function totalPagesFor(total: number, pageSize: number): number {
    return Math.ceil(total / pageSize);
}

export function buildPage<T>(items: T[], total: number, request: PageRequest): PageResult<T> {
    return {
        items,
        total,
        page: request.page,
        pageSize: request.pageSize,
        totalPages: totalPagesFor(total, request.pageSize),
    };
}
