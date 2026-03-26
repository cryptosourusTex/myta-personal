/**
 * Canvas LMS API client — runs inside Cloudflare Worker.
 * Handles pagination, error handling, and staleness detection.
 */

export class CanvasClient {
  constructor(
    private domain: string,
    private token: string,
  ) {}

  private get baseUrl() {
    return `https://${this.domain}/api/v1`;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const results: T[] = [];
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params);
      url += `?${qs.toString()}`;
    }

    let page = 0;
    const maxPages = 20; // safety limit

    while (url && page < maxPages) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Canvas API ${res.status}: ${body}`);
      }

      const data = await res.json() as T | T[];
      if (Array.isArray(data)) {
        results.push(...data);
      } else {
        results.push(data);
      }

      // Handle pagination via Link header
      const link = res.headers.get('Link');
      url = '';
      if (link) {
        const next = link.split(',').find((s) => s.includes('rel="next"'));
        if (next) {
          const match = next.match(/<([^>]+)>/);
          if (match) url = match[1];
        }
      }
      page++;
    }

    return results;
  }

  async getCourses(): Promise<CanvasCourse[]> {
    return this.request<CanvasCourse>('/courses', {
      enrollment_type: 'teacher',
      per_page: '50',
      include: ['total_students'],
      state: ['available'],
    } as any);
  }

  async getSections(courseId: string): Promise<CanvasSection[]> {
    return this.request<CanvasSection>(`/courses/${courseId}/sections`, {
      per_page: '50',
    });
  }

  async getStudents(courseId: string): Promise<CanvasStudent[]> {
    return this.request<CanvasStudent>(`/courses/${courseId}/enrollments`, {
      type: ['StudentEnrollment'],
      state: ['active'],
      per_page: '50',
    } as any);
  }

  async getAssignments(courseId: string): Promise<CanvasAssignment[]> {
    return this.request<CanvasAssignment>(`/courses/${courseId}/assignments`, {
      per_page: '50',
    });
  }

  async getRubric(courseId: string, rubricId: string): Promise<CanvasRubric> {
    const results = await this.request<CanvasRubric>(
      `/courses/${courseId}/rubrics/${rubricId}`,
      { include: ['criteria'] } as any,
    );
    return results[0];
  }
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  term?: { name: string };
  total_students?: number;
}

export interface CanvasSection {
  id: number;
  name: string;
  course_id: number;
}

export interface CanvasStudent {
  user_id: number;
  user: {
    id: number;
    name: string;
    email?: string;
    sortable_name?: string;
  };
  course_section_id: number;
  enrollment_state: string;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  points_possible: number | null;
  rubric_settings?: { id: string };
  rubric?: Array<{
    id: string;
    description: string;
    long_description?: string;
    points: number;
  }>;
}

export interface CanvasRubric {
  id: string;
  title: string;
  data?: Array<{
    id: string;
    description: string;
    long_description?: string;
    points: number;
  }>;
}
