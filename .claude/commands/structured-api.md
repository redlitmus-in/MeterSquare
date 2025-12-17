---
description: Generate structured API response (Cookbook tool use pattern)
---

# Structured API Response Generator

Using cookbook structured output patterns, generate a properly formatted API response.

## Requirements

1. **JSON Schema Definition**
   - Define clear type structure
   - Include all required fields
   - Add optional fields with defaults
   - Document each field's purpose

2. **Response Format**
   ```json
   {
     "success": boolean,
     "data": object | array,
     "message": string,
     "errors": array | null,
     "meta": {
       "timestamp": ISO8601,
       "version": string,
       "pagination": object | null
     }
   }
   ```

3. **Validation**
   - Type checking
   - Required field validation
   - Format validation (emails, URLs, dates)
   - Range validation for numbers

4. **Error Handling**
   - Structured error objects
   - HTTP status codes
   - User-friendly error messages
   - Developer debugging info (in dev mode)

## Output

Generate:
1. TypeScript interface or Python Pydantic model
2. Sample response with realistic data
3. Validation rules
4. OpenAPI/Swagger documentation snippet
5. Example usage code

**Specify your API endpoint details below:**
