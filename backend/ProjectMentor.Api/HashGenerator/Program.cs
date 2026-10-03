Console.Write("Password to hash: ");
var password = Console.ReadLine();

if (string.IsNullOrWhiteSpace(password))
{
	Console.Error.WriteLine("A non-empty password is required.");
	return;
}

Console.WriteLine(BCrypt.Net.BCrypt.HashPassword(password));