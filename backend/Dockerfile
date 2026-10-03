# ProjectMentor API for Railway (or any Docker host).
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ProjectMentor.Api/ProjectMentor.csproj ProjectMentor.Api/
RUN dotnet restore ProjectMentor.Api/ProjectMentor.csproj
COPY ProjectMentor.Api/ ProjectMentor.Api/
RUN dotnet publish ProjectMentor.Api/ProjectMentor.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
# Railway gives the port in $PORT; default 8080 elsewhere.
ENV ASPNETCORE_ENVIRONMENT=Production
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} dotnet ProjectMentor.dll"]
