import NextAuth from "next-auth";
import type { NextAuthOptions, User, Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
    })
  ],
  session: { strategy: 'jwt' as const },
  pages: { signIn: '/auth' },
  callbacks: {
    async signIn({ user, account }: { user: User; account: Account | null }) {
      // Upsert user in backend store
      try {
        const username = (user?.name || user?.email || 'user').toLowerCase().replace(/\s+/g,'');
        await fetch(`${apiBase}/api/auth/oauth-upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, provider: account?.provider })
        });
      } catch (e) {
        // Allow sign in even if backend is unreachable
      }
      return true;
    },
    async jwt({ token, account, profile }: { token: JWT; account?: Account | null; profile?: Profile | undefined }) {
      if (profile && !(token as any).username) {
        const name = ((profile as any).name || (profile as any).login || token.email || 'user').toLowerCase().replace(/\s+/g,'');
        (token as any).username = name;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      (session as any).username = (token as any).username || session.user?.name;
      return session;
    }
  }
};

const handler = NextAuth(authOptions as any);
export { handler as GET, handler as POST };